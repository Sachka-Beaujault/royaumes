/**
 * Vue filtrée d'une expédition de la Faille : ce qu'un joueur donné a le droit de connaître.
 * L'API ne renvoie jamais l'état complet, seulement cette vue.
 */
import { riftName } from './calendar'
import type { GuildId } from './catalog'
import type { Role } from './rift-content'
import { isBossFloor, settle } from './rift-rules'
import { evolve, type RunAction, type RunMonster, type RunPhase, type RunState } from './run'

export interface RunHeroView {
  id: string
  name: string
  role: Role
  hp: number
  maxHp: number
  /** Vrai si le héros a choisi son action pour la manche en cours. */
  ready: boolean
  /** Action choisie : connue du seul joueur qui incarne le héros, null pour les autres. */
  action: RunAction | null
}

export interface RunView {
  guild: GuildId
  day: string
  /** Nom de la Faille du jour de l'expédition. */
  name: string
  phase: RunPhase
  hostId: string
  /** Vrai si le joueur qui consulte la vue est l'hôte, ou un héros de l'expédition. */
  isHost: boolean
  isMember: boolean
  heroes: RunHeroView[]
  /** Étage en cours, et s'il est gardé par un boss. */
  floor: number
  bossFloor: boolean
  monsters: RunMonster[]
  round: number
  deadline: number | null
  lastRound: RunState['lastRound']
  /** Nombre d'étages franchis : le score de l'expédition. */
  floorsCleared: number
}

/**
 * Calcule la vue d'une expédition pour le joueur viewerId, à l'instant now.
 * Les manches échues sont résolues dans la vue, mais rien n'est enregistré :
 * une lecture n'écrit jamais.
 */
export function toRunView(state: RunState, viewerId: string, now: number): RunView | null {
  if (!state.exists) return null
  const current = settle(state, now).reduce(evolve, state)
  const inCombat = current.phase === 'combat'

  // La graine du jour (seed) et les choix des autres héros (choices) ne figurent pas dans la
  // vue : ce qui n'est pas transmis ne peut pas être lu. Les étages suivants ne sont tirés
  // qu'en y entrant, et ne peuvent donc pas être connus à l'avance.
  return {
    guild: current.guild,
    day: current.day,
    name: riftName(current.day),
    phase: current.phase,
    hostId: current.hostId,
    isHost: current.hostId === viewerId,
    isMember: current.heroes.some((hero) => hero.id === viewerId),
    heroes: current.heroes.map((hero) => ({
      id: hero.id,
      name: hero.name,
      role: hero.role,
      hp: hero.hp,
      maxHp: hero.maxHp,
      ready: inCombat && current.choices[hero.id] !== undefined,
      action: hero.id === viewerId ? (current.choices[hero.id] ?? null) : null,
    })),
    floor: current.floor,
    bossFloor: current.floor > 0 && isBossFloor(current.floor),
    monsters: current.monsters,
    round: current.round,
    deadline: current.deadline,
    lastRound: current.lastRound,
    floorsCleared: current.floorsCleared,
  }
}
