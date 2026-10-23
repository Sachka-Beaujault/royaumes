import { withOptimisticRetry } from '@/platform/event-store/retry'
import { dayOf, riftCalendar } from '../domain/calendar'
import { MAX_HEROES, type Role } from '../domain/rift-content'
import { decide, type RunCommand, type RunError } from '../domain/rift-rules'
import { type RunView, toRunView } from '../domain/run-view'
import type { GuildService } from './guild-service'
import type { OpenRunsReader } from './open-runs-reader'
import type { RunRepository } from './run-repository'

/**
 * Erreurs d'une commande de la Faille : celles de l'expédition, et celles de la participation
 * du joueur, enregistrée dans son flux d'appartenance.
 */
export type RiftError = RunError | { code: 'NO_GUILD' } | { code: 'ALREADY_ENTERED_TODAY' }

/** Résultat d'une commande : la vue mise à jour pour le joueur, ou l'erreur métier. */
export type RunResult = { ok: true; view: RunView } | { ok: false; error: RiftError }

/**
 * Nombre maximal de tentatives d'une commande. Tous les héros peuvent agir au même instant :
 * il faut au moins autant de tentatives que de héros, plus une pour la commande d'échéance.
 */
const MAX_ATTEMPTS = MAX_HEROES + 1

export interface RiftServiceOptions {
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle expédition ; un UUID aléatoire par défaut. */
  newId?: () => string
  /** Graine proposée pour un nouveau jour ; un entier aléatoire sur 32 bits par défaut. */
  newSeed?: () => number
}

/** Joueur à l'origine d'une commande. */
interface Player {
  id: string
  name: string
}

/**
 * Service applicatif de la Faille. Une inscription à une expédition touche deux flux : la
 * participation du jour est d'abord enregistrée dans le flux du joueur, qui garantit une seule
 * participation par jour ; l'inscription est ensuite enregistrée dans le flux de l'expédition.
 * Si celle-ci échoue, la participation est annulée.
 */
export function createRiftService(
  repo: RunRepository,
  openRuns: OpenRunsReader,
  members: GuildService,
  {
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0],
  }: RiftServiceOptions = {},
) {
  /**
   * Traite une commande sur une expédition : charger, décider, enregistrer, puis renvoyer la
   * vue du joueur viewerId. En cas de conflit d'écriture, l'ensemble est rejoué.
   */
  function execute(runId: string, viewerId: string, command: RunCommand) {
    return withOptimisticRetry(async (): Promise<RunResult> => {
      const { state, version } = await repo.load(runId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(runId, version, decision.events)
      const updated = await repo.load(runId)
      const view = toRunView(updated.state, viewerId, now)
      return view ? { ok: true, view } : { ok: false, error: { code: 'RUN_NOT_FOUND' } }
    }, MAX_ATTEMPTS)
  }

  /**
   * Inscrit un joueur à une expédition : sa participation du jour, puis la commande sur
   * l'expédition. La participation est annulée si la commande est refusée.
   *
   * DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-016) : les deux enregistrements ne
   * forment pas une transaction ; une interruption entre les deux laisse au joueur une
   * participation sans expédition, qui lui interdit la Faille jusqu'au lendemain.
   */
  async function enroll(runId: string, player: Player, command: RunCommand): Promise<RunResult> {
    const entry = await members.enterRift(player.id, runId)
    if (!entry.ok) {
      const code = entry.error.code === 'NOT_A_MEMBER' ? 'NO_GUILD' : 'ALREADY_ENTERED_TODAY'
      return { ok: false, error: { code } }
    }
    const result = await execute(runId, player.id, command)
    if (!result.ok) await members.cancelRiftEntry(player.id, runId)
    return result
  }

  /** Ouvre une expédition de la Faille du jour, dont le joueur devient l'hôte. */
  async function open(player: Player, role: Role) {
    const runId = newId()
    const guild = await members.guildOf(player.id)
    if (!guild) return { runId, result: { ok: false, error: { code: 'NO_GUILD' } } as RunResult }
    const day = dayOf(clock())
    const seed = await repo.daySeed(day, newSeed())
    const result = await enroll(runId, player, {
      type: 'OpenRun',
      playerId: player.id,
      name: player.name,
      guild,
      role,
      day,
      seed,
    })
    return { runId, result }
  }

  /**
   * Rejoint une expédition. La commande est d'abord décidée sans rien enregistrer : une
   * expédition complète, lancée, ou d'une autre guilde, ne consomme pas la participation du jour.
   */
  async function join(runId: string, player: Player, role: Role): Promise<RunResult> {
    const guild = await members.guildOf(player.id)
    if (!guild) return { ok: false, error: { code: 'NO_GUILD' } }
    const command: RunCommand = {
      type: 'JoinRun',
      playerId: player.id,
      name: player.name,
      guild,
      role,
    }
    const { state } = await repo.load(runId)
    const trial = decide(state, command, clock())
    if (!trial.ok) return trial
    return enroll(runId, player, command)
  }

  /** Vue d'une expédition pour un joueur ; null si elle n'existe pas. */
  async function getView(runId: string, viewerId: string): Promise<RunView | null> {
    const { state } = await repo.load(runId)
    return toRunView(state, viewerId, clock())
  }

  /**
   * Faille du jour et des jours suivants, expéditions ouvertes de la guilde du joueur, et
   * participation du joueur aujourd'hui.
   */
  async function overview(playerId: string) {
    const now = clock()
    const today = dayOf(now)
    const guild = await members.guildOf(playerId)
    const view = await members.getView(playerId)
    return {
      calendar: riftCalendar(now),
      runs: guild ? await openRuns.list(guild, today) : [],
      enteredToday: view.riftDay === today,
    }
  }

  return { execute, open, join, getView, overview }
}

/** Type du service, déduit de sa fabrique : utilisé par l'API du module. */
export type RiftService = ReturnType<typeof createRiftService>
