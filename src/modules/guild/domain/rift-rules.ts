/**
 * Règles de la Faille, selon le modèle decider :
 *   decide(état, commande, maintenant) -> événements ou erreur métier
 * Tout le hasard est tiré ici, à partir de la graine du jour, et enregistré dans les
 * événements : evolve (run.ts) ne fait qu'appliquer les résultats. Le contenu d'un étage ne
 * dépend que de la graine du jour, du numéro de l'étage et du nombre de héros : à effectif
 * égal, toutes les guildes affrontent la même Faille (règle 10).
 */
import type { GuildId } from './catalog'
import { mix, pick, type Random, randomInt, seeded } from './random'
import {
  BOSS,
  BOSS_EVERY,
  BOSS_GROWTH,
  COMMON_MONSTERS,
  DAMAGE_SPREAD,
  FLOOR_GROWTH,
  HEAL_AMOUNT,
  MAX_HEROES,
  MAX_MONSTERS,
  PARTY_HP_FACTOR,
  REST_HEAL,
  RIFT_MONSTERS,
  type RiftMonsterKind,
  ROLE_STATS,
  ROUND_MS,
  type Role,
  TANK_DAMAGE_FACTOR,
} from './rift-content'
import {
  applyEffect,
  evolve,
  type MonsterSpec,
  type RunAction,
  type RunEffect,
  type RunEvent,
  type RunHero,
  type RunPhase,
  type RunState,
  standingHeroes,
  standingMonsters,
} from './run'

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type RunCommand =
  | {
      type: 'OpenRun'
      playerId: string
      name: string
      guild: GuildId
      role: Role
      day: string
      seed: number
    }
  | { type: 'JoinRun'; playerId: string; name: string; guild: GuildId; role: Role }
  | { type: 'StartRun'; playerId: string }
  // round : la manche pour laquelle le joueur a choisi, telle qu'il l'a vue à l'écran.
  | { type: 'SubmitAction'; playerId: string; round: number; action: RunAction }
  // Commande d'échéance : n'a pas d'autre effet que d'enregistrer les manches échues.
  | { type: 'CheckDeadline' }

export type RunError =
  | { code: 'RUN_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'WRONG_PHASE'; phase: RunPhase }
  | { code: 'RUN_FULL' }
  | { code: 'ALREADY_JOINED' }
  | { code: 'WRONG_GUILD' }
  | { code: 'NOT_A_MEMBER' }
  | { code: 'NOT_HOST' }
  | { code: 'HERO_DOWN' }
  | { code: 'ROUND_OVER'; round: number }
  | { code: 'ALREADY_CHOSEN' }
  | { code: 'INVALID_TARGET' }

export type RunDecision = { ok: true; events: RunEvent[] } | { ok: false; error: RunError }

const fail = (error: RunError): RunDecision => ({ ok: false, error })
const accept = (...events: RunEvent[]): RunDecision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Contenu des étages
// ---------------------------------------------------------------------------

/** Indique si un étage est gardé par un boss : un étage sur cinq (règle 14). */
export const isBossFloor = (floor: number) => floor % BOSS_EVERY === 0

/**
 * Caractéristiques d'un monstre à un étage : ses points de vie et son attaque croissent avec
 * l'étage, ses points de vie avec le nombre de héros, et ceux du boss à chaque apparition.
 */
export function monsterAt(kind: RiftMonsterKind, floor: number, heroCount: number): MonsterSpec {
  const base = RIFT_MONSTERS[kind]
  const growth = 1 + FLOOR_GROWTH.hp * (floor - 1)
  const party = 1 + PARTY_HP_FACTOR * (heroCount - 1)
  const appearance = kind === BOSS ? 1 + BOSS_GROWTH * (floor / BOSS_EVERY - 1) : 1
  return {
    kind,
    hp: Math.round(base.hp * growth * party * appearance),
    attack: base.attack + Math.floor(FLOOR_GROWTH.attack * (floor - 1)),
  }
}

/**
 * Tire les monstres d'un étage. La graine dérivée mix(seed, 2, floor) ne sert qu'à cet étage :
 * le même étage est obtenu pour la même graine du jour, quelle que soit l'expédition.
 */
export function generateFloor(seed: number, floor: number, heroCount: number): MonsterSpec[] {
  if (isBossFloor(floor)) return [monsterAt(BOSS, floor, heroCount)]
  const random = seeded(mix(seed, 2, floor))
  const count = randomInt(random, 1, MAX_MONSTERS)
  return Array.from({ length: count }, () =>
    monsterAt(pick(random, COMMON_MONSTERS), floor, heroCount),
  )
}

/** Entrée à l'étage suivant, à l'instant at : ses monstres sont enregistrés dans l'événement. */
function enterFloor(state: RunState, floor: number, at: number): RunEvent {
  return {
    type: 'FloorEntered',
    data: {
      floor,
      monsters: generateFloor(state.seed, floor, state.heroes.length),
      rest: floor === 1 ? 0 : REST_HEAL,
      deadline: at + ROUND_MS,
      at,
    },
  }
}

// ---------------------------------------------------------------------------
// Résolution d'une manche
// ---------------------------------------------------------------------------

/** Dégâts infligés par un combattant : son attaque, plus ou moins l'écart autorisé. */
const rollDamage = (random: Random, attack: number, spread: number) =>
  Math.max(1, randomInt(random, attack - spread, attack + spread))

/**
 * Cible d'un monstre : le premier tank debout, qui attire les coups (règle 12) ; à défaut,
 * un héros debout tiré au sort.
 */
function monsterTarget(heroes: RunHero[], random: Random): RunHero {
  return heroes.find((hero) => hero.role === 'tank') ?? pick(random, heroes)
}

/**
 * Dégâts subis par un héros : la défense les divise par deux, et le tank n'en subit qu'une
 * part ; le résultat est arrondi à l'unité supérieure, et vaut au moins 1.
 */
export function damageTaken(amount: number, hero: RunHero, action: RunAction | undefined) {
  let taken = action?.type === 'defend' ? amount / 2 : amount
  if (hero.role === 'tank') taken *= TANK_DAMAGE_FACTOR
  return Math.max(1, Math.ceil(taken))
}

/**
 * Résout la manche en cours à l'instant at, et renvoie les événements qui en résultent.
 * La graine dérivée mix(seed, 1, floor, round) ne dépend que de l'étage et de la manche : la
 * résolution produit toujours le même résultat, quel que soit le moment où elle est calculée.
 */
export function resolveRound(state: RunState, at: number): RunEvent[] {
  const random = seeded(mix(state.seed, 1, state.floor, state.round))

  // Un héros sans choix se défend (règle 13).
  const actions: Record<string, RunAction> = {}
  for (const hero of standingHeroes(state)) {
    actions[hero.id] = state.choices[hero.id] ?? { type: 'defend' }
  }

  // Copies de travail, mises à jour effet après effet.
  let heroes = state.heroes
  let monsters = state.monsters
  const effects: RunEffect[] = []
  const record = (effect: RunEffect) => {
    effects.push(effect)
    heroes = applyEffect(heroes, effect)
    monsters = applyEffect(monsters, effect)
  }
  const roleOf = (heroId: string) => heroes.find((hero) => hero.id === heroId)?.role ?? 'tank'

  // 1. Les soins, appliqués avant toute attaque ; le soigneur rend davantage de points de vie.
  for (const [heroId, action] of Object.entries(actions)) {
    if (action.type !== 'heal') continue
    if (!heroes.some((hero) => hero.id === action.target && hero.hp > 0)) continue
    const amount = HEAL_AMOUNT[roleOf(heroId)]
    record({ kind: 'heal', source: heroId, target: action.target, amount })
  }

  // 2. Les attaques des héros. Si la cible est déjà vaincue, le premier monstre debout est visé.
  for (const [heroId, action] of Object.entries(actions)) {
    if (action.type !== 'attack') continue
    const target = monsters.some((m) => m.id === action.target && m.hp > 0)
      ? action.target
      : monsters.find((monster) => monster.hp > 0)?.id
    if (!target) break
    const attack = heroes.find((hero) => hero.id === heroId)?.attack ?? 0
    record({
      kind: 'damage',
      source: heroId,
      target,
      amount: rollDamage(random, attack, DAMAGE_SPREAD.hero),
    })
  }

  // 3. Les attaques des monstres encore debout.
  for (const monster of monsters) {
    const targets = heroes.filter((hero) => hero.hp > 0)
    if (monster.hp <= 0 || targets.length === 0) continue
    const target = monsterTarget(targets, random)
    const amount = rollDamage(random, monster.attack, DAMAGE_SPREAD.monster)
    record({
      kind: 'damage',
      source: monster.id,
      target: target.id,
      amount: damageTaken(amount, target, actions[target.id]),
    })
  }

  // 4. Issue de la manche : le combat continue, l'étage est franchi, ou l'expédition s'achève.
  const heroesLeft = heroes.some((hero) => hero.hp > 0)
  const monstersLeft = monsters.some((monster) => monster.hp > 0)
  const resolved: RunEvent = {
    type: 'RoundResolved',
    data: {
      round: state.round,
      actions,
      effects,
      nextDeadline: heroesLeft && monstersLeft ? at + ROUND_MS : null,
      at,
    },
  }
  if (heroesLeft && monstersLeft) return [resolved]
  const after = evolve(state, resolved)
  if (heroesLeft) return [resolved, enterFloor(after, state.floor + 1, at)]
  return [
    resolved,
    {
      type: 'RunEnded',
      data: {
        guild: state.guild,
        day: state.day,
        floorsCleared: after.floorsCleared,
        heroIds: state.heroes.map((hero) => hero.id),
        at,
      },
    },
  ]
}

/**
 * Échéances paresseuses : renvoie les événements de toutes les manches échues à l'instant now.
 * Chaque manche est résolue à l'instant de son échéance, et non à l'instant now : le résultat
 * ne dépend pas du moment du calcul.
 */
export function settle(state: RunState, now: number): RunEvent[] {
  const events: RunEvent[] = []
  let current = state
  while (current.phase === 'combat' && current.deadline !== null && current.deadline <= now) {
    const due = resolveRound(current, current.deadline)
    events.push(...due)
    current = due.reduce(evolve, current)
  }
  return events
}

// ---------------------------------------------------------------------------
// decide : enregistre les manches échues, puis traite la commande
// ---------------------------------------------------------------------------

export function decide(state: RunState, command: RunCommand, now: number): RunDecision {
  const due = settle(state, now)
  const current = due.reduce(evolve, state)
  const decision = decideCommand(current, command, now)
  // Si la commande est refusée, rien n'est enregistré, pas même les manches échues.
  return decision.ok ? { ok: true, events: [...due, ...decision.events] } : decision
}

const isMember = (state: RunState, playerId: string) =>
  state.heroes.some((hero) => hero.id === playerId)

function decideCommand(state: RunState, command: RunCommand, now: number): RunDecision {
  if (command.type === 'OpenRun') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { playerId, name, guild, role, day, seed } = command
    return accept({
      type: 'RunOpened',
      data: {
        guild,
        day,
        hostId: playerId,
        hostName: name,
        role,
        hero: { ...ROLE_STATS[role] },
        seed,
        at: now,
      },
    })
  }

  if (!state.exists) return fail({ code: 'RUN_NOT_FOUND' })

  switch (command.type) {
    case 'JoinRun':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (isMember(state, command.playerId)) return fail({ code: 'ALREADY_JOINED' })
      // Une expédition réunit des joueurs d'une même guilde (règle 11).
      if (command.guild !== state.guild) return fail({ code: 'WRONG_GUILD' })
      if (state.heroes.length >= MAX_HEROES) return fail({ code: 'RUN_FULL' })
      return accept({
        type: 'HeroJoined',
        data: {
          playerId: command.playerId,
          name: command.name,
          role: command.role,
          hero: { ...ROLE_STATS[command.role] },
          at: now,
        },
      })

    case 'StartRun':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (command.playerId !== state.hostId) return fail({ code: 'NOT_HOST' })
      return accept({ type: 'RunStarted', data: { at: now } }, enterFloor(state, 1, now))

    case 'SubmitAction': {
      if (state.phase !== 'combat') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      const hero = state.heroes.find((candidate) => candidate.id === command.playerId)
      if (!hero) return fail({ code: 'NOT_A_MEMBER' })
      if (hero.hp <= 0) return fail({ code: 'HERO_DOWN' })
      if (command.round !== state.round) return fail({ code: 'ROUND_OVER', round: state.round })
      if (state.choices[hero.id]) return fail({ code: 'ALREADY_CHOSEN' })
      if (!isValidTarget(state, command.action)) return fail({ code: 'INVALID_TARGET' })

      const submitted: RunEvent = {
        type: 'ActionSubmitted',
        data: { heroId: hero.id, round: state.round, action: command.action, at: now },
      }
      // Si tous les héros debout ont choisi, la manche est résolue sans attendre l'échéance.
      const after = evolve(state, submitted)
      const everyoneReady = standingHeroes(after).every((h) => after.choices[h.id] !== undefined)
      return everyoneReady ? accept(submitted, ...resolveRound(after, now)) : accept(submitted)
    }

    case 'CheckDeadline':
      // Les échéances passées ont déjà été traitées par decide : il n'y a rien d'autre à faire.
      return accept()
  }
}

/** Une attaque vise un monstre debout, un soin un héros debout. */
function isValidTarget(state: RunState, action: RunAction): boolean {
  if (action.type === 'attack') {
    return standingMonsters(state).some((monster) => monster.id === action.target)
  }
  if (action.type === 'heal') {
    return standingHeroes(state).some((hero) => hero.id === action.target)
  }
  return true
}
