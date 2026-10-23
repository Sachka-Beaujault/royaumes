import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { GUILD_TOPICS } from '../contracts'
import type { GuildId } from '../domain/catalog'
import {
  decide,
  evolve,
  type MemberCommand,
  type MemberError,
  type MemberEvent,
  type MemberState,
} from '../domain/member'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type MemberView, toView } from '../domain/view'
import type { MemberRepository } from './member-repository'

/** Résultat d'une commande d'un joueur : la vue de son appartenance, ou l'erreur métier. */
export type CommandResult = { ok: true; view: MemberView } | { ok: false; error: MemberError }

export interface GuildServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Traduit une demande de la saga en message de la boîte d'envoi adressé au Village. */
function toMessage(request: SagaRequest): NewMessage {
  const payload = {
    transferId: request.transferId,
    playerId: request.playerId,
    resources: request.resources,
  }
  switch (request.kind) {
    case 'withdraw':
      // Adresse de retour : la réponse du Village fera progresser la saga.
      return {
        topic: REALM_TOPICS.withdraw,
        payload: { ...payload, replyTo: GUILD_TOPICS.transferResult },
      }
    case 'deposit':
      return { topic: REALM_TOPICS.deposit, payload }
  }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état du membre. */
function messagesFor(state: MemberState, events: MemberEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request))
  }
  return messages
}

/**
 * Service applicatif de la Guilde : orchestrateur de la saga de changement de guilde.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createGuildService(
  repo: MemberRepository,
  { dispatch, clock = () => Date.now() }: GuildServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur un membre, avec les messages de la saga.
   * En cas de conflit de version, l'ensemble est rejoué sur l'état à jour : aucun message
   * n'a été enregistré par la tentative refusée.
   */
  function process(playerId: string, command: MemberCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(playerId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(playerId, version, decision.events, messagesFor(state, decision.events))
      return decision
    })
  }

  /**
   * Commande d'un joueur : la décision est enregistrée, puis la boîte d'envoi distribuée.
   * Dans le cas ordinaire, la saga a progressé jusqu'à son prochain état stable lorsque
   * la vue est renvoyée.
   */
  async function execute(playerId: string, command: MemberCommand): Promise<CommandResult> {
    const decision = await process(playerId, command)
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await repo.load(playerId)
    return { ok: true, view: toView(state) }
  }

  /** Premier choix d'une guilde, au nom d'un joueur. */
  const join = (playerId: string, guild: GuildId) =>
    execute(playerId, { type: 'JoinGuild', playerId, guild })

  /** Demande de changement de guilde, au nom d'un joueur. */
  const requestChange = (playerId: string, guild: GuildId) =>
    execute(playerId, { type: 'RequestChange', playerId, guild })

  /**
   * Vue de l'appartenance d'un joueur. La boîte d'envoi est d'abord distribuée : une saga
   * interrompue reprend dès que le joueur consulte sa guilde.
   */
  async function getView(playerId: string) {
    await dispatch()
    const { state } = await repo.load(playerId)
    return toView(state)
  }

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie :
   * elle est levée, et le message sera retenté.
   */
  async function step(playerId: string, command: MemberCommand) {
    const decision = await process(playerId, command)
    if (!decision.ok) throw new Error(`Membre ${playerId} : ${decision.error.code}`)
  }

  return { join, requestChange, getView, step }
}

/** Type du service, déduit de sa fabrique. */
export type GuildService = ReturnType<typeof createGuildService>
