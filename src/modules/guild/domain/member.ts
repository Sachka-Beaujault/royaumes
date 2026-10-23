/**
 * Domaine de la Guilde : l'appartenance d'un joueur à une guilde, selon le modèle decider.
 * L'état d'un membre résume aussi l'avancement de la saga de changement de guilde.
 * Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import type { GuildId } from './catalog'

/** Quantités de ressources d'un mouvement, par nom de ressource (« gold »...). */
export type Amounts = Partial<Record<string, number>>

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface MemberState {
  /** Faux tant que le joueur n'a choisi aucune guilde. */
  exists: boolean
  playerId: string
  /** Guilde actuelle ; null tant qu'aucune n'a été choisie. */
  guild: GuildId | null
  /** Changement en attente de la réponse du Village, s'il y en a un. */
  pending: { attempt: number; to: GuildId } | null
  /** Numéro de la dernière demande de changement : chaque demande a son propre mouvement. */
  attempt: number
  /** Dernière demande annulée, et son motif, présentés au joueur. */
  lastCancel: { reason: 'refused'; missing: Amounts } | null
}

export const initialState: MemberState = {
  exists: false,
  playerId: '',
  guild: null,
  pending: null,
  attempt: 0,
  lastCancel: null,
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type MemberEvent =
  | { type: 'GuildJoined'; data: { playerId: string; guild: GuildId; at: number } }
  | {
      type: 'ChangeRequested'
      data: { attempt: number; from: GuildId; to: GuildId; at: number }
    }
  | { type: 'GuildChanged'; data: { attempt: number; from: GuildId; to: GuildId; at: number } }
  | {
      type: 'ChangeCancelled'
      data: { attempt: number; reason: 'refused'; missing: Amounts; at: number }
    }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type MemberCommand =
  // Commandes des joueurs.
  | { type: 'JoinGuild'; playerId: string; guild: GuildId }
  | { type: 'RequestChange'; playerId: string; guild: GuildId }
  // Commande de la saga, issue des messages de la boîte d'envoi.
  | {
      type: 'RecordTransferResult'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }

export type MemberError =
  | { code: 'ALREADY_MEMBER' }
  | { code: 'NOT_A_MEMBER' }
  | { code: 'SAME_GUILD' }
  | { code: 'CHANGE_PENDING' }

export type Decision = { ok: true; events: MemberEvent[] } | { ok: false; error: MemberError }

const fail = (error: MemberError): Decision => ({ ok: false, error })
const accept = (...events: MemberEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Identifiants des mouvements de ressources
// ---------------------------------------------------------------------------

/**
 * Identifiant d'un mouvement de ressources : il est déterminé par le joueur, la demande et
 * l'étape de la saga, et sert de clé d'idempotence au Village. Le préfixe « guild- » le
 * distingue des mouvements des autres modules.
 */
export const transferIdOf = (playerId: string, step: string) => `guild-${playerId}:${step}`

/** Identifiant du joueur auquel se rapporte un mouvement. */
export const playerIdOf = (transferId: string) =>
  transferId.slice('guild-'.length, transferId.lastIndexOf(':'))

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

export function evolve(state: MemberState, event: MemberEvent): MemberState {
  switch (event.type) {
    case 'GuildJoined':
      return {
        ...initialState,
        exists: true,
        playerId: event.data.playerId,
        guild: event.data.guild,
      }
    case 'ChangeRequested':
      return {
        ...state,
        pending: { attempt: event.data.attempt, to: event.data.to },
        attempt: event.data.attempt,
        lastCancel: null,
      }
    case 'GuildChanged':
      return { ...state, guild: event.data.to, pending: null }
    case 'ChangeCancelled':
      return {
        ...state,
        pending: null,
        lastCancel: { reason: event.data.reason, missing: event.data.missing },
      }
  }
}

export const replay = (events: MemberEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(state: MemberState, command: MemberCommand, now: number): Decision {
  if (command.type === 'JoinGuild') {
    // Le premier choix est gratuit ; les suivants passent par une demande de changement.
    if (state.exists) return fail({ code: 'ALREADY_MEMBER' })
    return accept({
      type: 'GuildJoined',
      data: { playerId: command.playerId, guild: command.guild, at: now },
    })
  }

  if (!state.exists || !state.guild) return fail({ code: 'NOT_A_MEMBER' })

  switch (command.type) {
    case 'RequestChange':
      if (command.guild === state.guild) return fail({ code: 'SAME_GUILD' })
      if (state.pending) return fail({ code: 'CHANGE_PENDING' })
      return accept({
        type: 'ChangeRequested',
        data: { attempt: state.attempt + 1, from: state.guild, to: command.guild, at: now },
      })

    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)
  }
}

/**
 * Réponse du Village au prélèvement d'un changement. Seule la réponse attendue pour la
 * demande en cours fait progresser la saga ; toute autre réponse (doublon, réponse tardive,
 * confirmation d'un remboursement) est ignorée.
 */
function recordTransferResult(
  state: MemberState,
  result: Extract<MemberCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const { pending, guild } = state
  if (!pending || !guild) return accept()
  if (result.transferId !== transferIdOf(state.playerId, `change-${pending.attempt}`)) {
    return accept()
  }
  if (result.outcome === 'refused') {
    return accept({
      type: 'ChangeCancelled',
      data: { attempt: pending.attempt, reason: 'refused', missing: result.missing ?? {}, at: now },
    })
  }
  return accept({
    type: 'GuildChanged',
    data: { attempt: pending.attempt, from: guild, to: pending.to, at: now },
  })
}
