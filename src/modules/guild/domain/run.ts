/**
 * État et événements d'une expédition de la Faille, et fonction evolve.
 * Les règles de la Faille (decide) se trouvent dans rift-rules.ts.
 */
import type { GuildId } from './catalog'
import type { RiftMonsterKind, Role } from './rift-content'

// ---------------------------------------------------------------------------
// Éléments de la Faille
// ---------------------------------------------------------------------------

/** Phase d'une expédition. */
export type RunPhase = 'lobby' | 'combat' | 'ended'

/** Caractéristiques d'un monstre, fixées lors du tirage de son étage. */
export interface MonsterSpec {
  kind: RiftMonsterKind
  hp: number
  attack: number
}

/** Caractéristiques de départ d'un héros, enregistrées lorsqu'il rejoint l'expédition. */
export interface HeroSpec {
  hp: number
  attack: number
}

export interface RunHero {
  /** Identifiant du joueur qui incarne le héros. */
  id: string
  name: string
  role: Role
  hp: number
  maxHp: number
  attack: number
}

export interface RunMonster {
  /** Identifiant unique dans l'étage : « m0 », « m1 »... */
  id: string
  kind: RiftMonsterKind
  hp: number
  maxHp: number
  attack: number
}

/** Action choisie par un héros pour une manche de combat. */
export type RunAction =
  | { type: 'attack'; target: string }
  | { type: 'defend' }
  | { type: 'heal'; target: string }

/** Effet produit par la résolution d'une manche. */
export type RunEffect =
  | { kind: 'damage'; source: string; target: string; amount: number }
  | { kind: 'heal'; source: string; target: string; amount: number }

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface RunState {
  /** Faux tant que l'expédition n'a pas été ouverte. */
  exists: boolean
  hostId: string
  /** Guilde de l'expédition : seuls ses membres peuvent la rejoindre. */
  guild: GuildId
  /** Jour de la Faille affrontée. */
  day: string
  /** Graine du jour : information secrète, jamais transmise aux joueurs. */
  seed: number
  phase: RunPhase
  heroes: RunHero[]
  /** Étage en cours ; 0 tant que l'expédition n'est pas lancée. */
  floor: number
  /** Monstres de l'étage en cours, vaincus compris. */
  monsters: RunMonster[]
  /** Numéro de la manche en cours ; il ne repart jamais de 1, d'un étage à l'autre. */
  round: number
  /** Échéance de la manche en cours, en millisecondes ; null hors combat. */
  deadline: number | null
  /** Actions déjà choisies pour la manche en cours, par identifiant de héros. */
  choices: Record<string, RunAction>
  /** Résultat de la dernière manche résolue, affiché aux joueurs. */
  lastRound: { round: number; actions: Record<string, RunAction>; effects: RunEffect[] } | null
  /** Nombre d'étages franchis : le score de l'expédition. */
  floorsCleared: number
}

/** État d'une expédition qui n'a encore connu aucun événement. */
export const initialState: RunState = {
  exists: false,
  hostId: '',
  guild: 'red',
  day: '',
  seed: 0,
  phase: 'lobby',
  heroes: [],
  floor: 0,
  monsters: [],
  round: 0,
  deadline: null,
  choices: {},
  lastRound: null,
  floorsCleared: 0,
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type RunEvent =
  | {
      type: 'RunOpened'
      data: {
        guild: GuildId
        day: string
        hostId: string
        hostName: string
        role: Role
        hero: HeroSpec
        seed: number
        at: number
      }
    }
  | {
      type: 'HeroJoined'
      data: { playerId: string; name: string; role: Role; hero: HeroSpec; at: number }
    }
  | { type: 'RunStarted'; data: { at: number } }
  | {
      type: 'FloorEntered'
      data: {
        floor: number
        /** Monstres de l'étage, tirés au sort et enregistrés avec leurs caractéristiques. */
        monsters: MonsterSpec[]
        /** Points de vie rendus à chaque héros debout en atteignant l'étage. */
        rest: number
        /** Échéance de la première manche de l'étage. */
        deadline: number
        at: number
      }
    }
  | {
      type: 'ActionSubmitted'
      data: { heroId: string; round: number; action: RunAction; at: number }
    }
  | {
      type: 'RoundResolved'
      data: {
        round: number
        /** Actions de tous les héros debout, y compris la défense des héros sans choix. */
        actions: Record<string, RunAction>
        /** Effets tirés au sort lors de la résolution, appliqués tels quels par evolve. */
        effects: RunEffect[]
        /** Échéance de la manche suivante ; null si le combat de l'étage est terminé. */
        nextDeadline: number | null
        at: number
      }
    }
  | {
      type: 'RunEnded'
      data: {
        guild: GuildId
        day: string
        floorsCleared: number
        heroIds: string[]
        at: number
      }
    }

// ---------------------------------------------------------------------------
// Fonctions utilitaires sur l'état
// ---------------------------------------------------------------------------

/** Héros encore debout. */
export const standingHeroes = (state: RunState) => state.heroes.filter((hero) => hero.hp > 0)

/** Monstres encore debout. */
export const standingMonsters = (state: RunState) =>
  state.monsters.filter((monster) => monster.hp > 0)

/** Applique un effet aux combattants, sans descendre sous 0 ni dépasser le maximum. */
export function applyEffect<T extends { id: string; hp: number; maxHp: number }>(
  fighters: T[],
  effect: RunEffect,
): T[] {
  return fighters.map((fighter) => {
    if (fighter.id !== effect.target) return fighter
    const change = effect.kind === 'damage' ? -effect.amount : effect.amount
    return { ...fighter, hp: Math.max(0, Math.min(fighter.maxHp, fighter.hp + change)) }
  })
}

/** Crée un héros à partir des caractéristiques enregistrées dans l'événement. */
const newHero = (id: string, name: string, role: Role, spec: HeroSpec): RunHero => ({
  id,
  name,
  role,
  hp: spec.hp,
  maxHp: spec.hp,
  attack: spec.attack,
})

/** Crée les monstres d'un étage à partir des caractéristiques enregistrées. */
const spawn = (specs: MonsterSpec[]): RunMonster[] =>
  specs.map((spec, index) => ({
    id: `m${index}`,
    kind: spec.kind,
    hp: spec.hp,
    maxHp: spec.hp,
    attack: spec.attack,
  }))

// ---------------------------------------------------------------------------
// evolve : applique un événement, sans aucune vérification ni aucun tirage.
// ---------------------------------------------------------------------------

export function evolve(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'RunOpened': {
      const { guild, day, hostId, hostName, role, hero, seed } = event.data
      return {
        ...initialState,
        exists: true,
        hostId,
        guild,
        day,
        seed,
        heroes: [newHero(hostId, hostName, role, hero)],
      }
    }

    case 'HeroJoined': {
      const { playerId, name, role, hero } = event.data
      return { ...state, heroes: [...state.heroes, newHero(playerId, name, role, hero)] }
    }

    case 'RunStarted':
      return { ...state, phase: 'combat' }

    case 'FloorEntered':
      // Le repos est appliqué aux héros debout ; les héros tombés ne se relèvent pas.
      return {
        ...state,
        phase: 'combat',
        floor: event.data.floor,
        heroes: state.heroes.map((hero) =>
          hero.hp > 0 ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + event.data.rest) } : hero,
        ),
        monsters: spawn(event.data.monsters),
        round: state.round + 1,
        deadline: event.data.deadline,
        choices: {},
      }

    case 'ActionSubmitted':
      return { ...state, choices: { ...state.choices, [event.data.heroId]: event.data.action } }

    case 'RoundResolved': {
      // Les effets enregistrés sont appliqués dans leur ordre : aucun hasard ici.
      let heroes = state.heroes
      let monsters = state.monsters
      for (const effect of event.data.effects) {
        heroes = applyEffect(heroes, effect)
        monsters = applyEffect(monsters, effect)
      }
      const floorOver = event.data.nextDeadline === null
      const floorCleared = floorOver && monsters.every((monster) => monster.hp <= 0)
      return {
        ...state,
        heroes,
        monsters,
        lastRound: {
          round: event.data.round,
          actions: event.data.actions,
          effects: event.data.effects,
        },
        choices: {},
        round: floorOver ? state.round : state.round + 1,
        deadline: event.data.nextDeadline,
        floorsCleared: floorCleared ? state.floorsCleared + 1 : state.floorsCleared,
      }
    }

    case 'RunEnded':
      return { ...state, phase: 'ended', deadline: null, choices: {} }
  }
}

/** Reconstruit l'état d'une expédition à partir de la suite de ses événements. */
export const replayRun = (events: RunEvent[]) => events.reduce(evolve, initialState)
