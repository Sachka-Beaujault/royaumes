import { describe, expect, it } from 'vitest'
import { BOSS, HEAL_AMOUNT, MAX_HEROES, ROLE_STATS, ROUND_MS } from './rift-content'
import {
  damageTaken,
  decide,
  generateFloor,
  isBossFloor,
  monsterAt,
  type RunCommand,
  resolveRound,
  settle,
} from './rift-rules'
import { evolve, initialState, type RunState } from './run'

const T0 = Date.UTC(2026, 9, 23, 12, 0)
const DAY = '2026-10-23'
const SEED = 42

/** Applique une commande acceptée, et renvoie le nouvel état et ses événements. */
function play(state: RunState, command: RunCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  return { state: decision.events.reduce(evolve, state), events: decision.events }
}

const open = (role: 'tank' | 'healer' | 'attacker' = 'tank', seed = SEED): RunCommand => ({
  type: 'OpenRun',
  playerId: 'alice',
  name: 'Alice',
  guild: 'red',
  role,
  day: DAY,
  seed,
})
const join = (
  playerId: string,
  role: 'tank' | 'healer' | 'attacker',
  guild: 'red' | 'green' = 'red',
): RunCommand => ({ type: 'JoinRun', playerId, name: playerId, guild, role })

// Expédition d'Alice (tank), Bob (soigneur) et Carol (attaquante) : salon, puis premier étage.
const lobby = [join('bob', 'healer'), join('carol', 'attacker')].reduce(
  (state, command) => play(state, command).state,
  play(initialState, open()).state,
)
const started = play(lobby, { type: 'StartRun', playerId: 'alice' }).state

/** Monstre debout du premier étage, cible d'une attaque. */
const firstMonster = (state: RunState) => state.monsters.find((m) => m.hp > 0)?.id ?? ''

describe('Faille - contenu du jour (règle 10)', () => {
  it("ne dépend que de la graine du jour et de l'étage", () => {
    expect(generateFloor(SEED, 3)).toEqual(generateFloor(SEED, 3))
    const floors = Array.from({ length: 8 }, (_, i) => i + 1)
    const other = floors.map((floor) => generateFloor(SEED + 1, floor))
    expect(floors.map((floor) => generateFloor(SEED, floor))).not.toEqual(other)
  })

  it('présente les mêmes monstres à toutes les guildes, quel que soit le nombre de leurs héros', () => {
    // La Garde de l'Onde part seule ; l'Ordre du Dragon, à trois (Alice, Bob et Carol).
    const solo = play(
      play(initialState, { ...open(), playerId: 'dave', guild: 'blue' } as RunCommand).state,
      { type: 'StartRun', playerId: 'dave' },
    ).state
    expect(solo.heroes).toHaveLength(1)
    expect(started.heroes).toHaveLength(3)
    expect(solo.monsters).toEqual(started.monsters)
  })
})

describe('Faille - groupe et rôles (règles 11 et 12)', () => {
  it('enregistre le rôle de chaque héros, et ses caractéristiques de départ', () => {
    expect(lobby.heroes.map((h) => [h.id, h.role, h.maxHp, h.attack])).toEqual([
      ['alice', 'tank', ROLE_STATS.tank.hp, ROLE_STATS.tank.attack],
      ['bob', 'healer', ROLE_STATS.healer.hp, ROLE_STATS.healer.attack],
      ['carol', 'attacker', ROLE_STATS.attacker.hp, ROLE_STATS.attacker.attack],
    ])
  })

  it("refuse un joueur d'une autre guilde, un cinquième héros, ou une arrivée après le départ", () => {
    expect(decide(lobby, join('dave', 'tank', 'green'), T0)).toEqual({
      ok: false,
      error: { code: 'WRONG_GUILD' },
    })
    const full = play(lobby, join('dave', 'tank')).state
    expect(full.heroes).toHaveLength(MAX_HEROES)
    expect(decide(full, join('erin', 'tank'), T0)).toEqual({
      ok: false,
      error: { code: 'RUN_FULL' },
    })
    expect(decide(started, join('dave', 'tank'), T0)).toEqual({
      ok: false,
      error: { code: 'WRONG_PHASE', phase: 'combat' },
    })
  })

  it("permet à un joueur seul de lancer son expédition, et réserve le départ à l'hôte", () => {
    const solo = play(initialState, open('attacker')).state
    expect(play(solo, { type: 'StartRun', playerId: 'alice' }).state).toMatchObject({
      phase: 'combat',
      floor: 1,
    })
    expect(decide(lobby, { type: 'StartRun', playerId: 'bob' }, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_HOST' },
    })
  })

  it('fait du tank la cible de tous les monstres tant qu’il est debout', () => {
    const events = resolveRound(started, T0 + 1000)
    const resolved = events[0]
    if (resolved.type !== 'RoundResolved') throw new Error(resolved.type)
    const blows = resolved.data.effects.filter((e) => e.kind === 'damage' && e.source[0] === 'm')
    expect(blows.length).toBeGreaterThan(0)
    for (const blow of blows) expect(blow.target).toBe('alice')
  })

  it('réduit les dégâts subis par le tank, et divise par deux ceux d’un héros qui se défend', () => {
    const [tank, healer] = started.heroes
    expect(damageTaken(10, tank, undefined)).toBe(7)
    expect(damageTaken(10, tank, { type: 'defend' })).toBe(4)
    expect(damageTaken(10, healer, undefined)).toBe(10)
    expect(damageTaken(10, healer, { type: 'defend' })).toBe(5)
    expect(damageTaken(1, tank, { type: 'defend' })).toBe(1)
  })

  it('fait rendre au soigneur deux fois plus de points de vie qu’aux autres rôles', () => {
    const wounded = { ...started, heroes: started.heroes.map((h) => ({ ...h, hp: 10 })) }
    const choices = {
      alice: { type: 'heal' as const, target: 'carol' },
      bob: { type: 'heal' as const, target: 'carol' },
    }
    const [resolved] = resolveRound({ ...wounded, choices }, T0 + 1000)
    if (resolved.type !== 'RoundResolved') throw new Error(resolved.type)
    const heals = resolved.data.effects.filter((e) => e.kind === 'heal')
    expect(heals).toEqual([
      { kind: 'heal', source: 'alice', target: 'carol', amount: HEAL_AMOUNT.tank },
      { kind: 'heal', source: 'bob', target: 'carol', amount: HEAL_AMOUNT.healer },
    ])
    expect(HEAL_AMOUNT.healer).toBe(2 * HEAL_AMOUNT.tank)
  })

  it("donne à l'attaquante la meilleure attaque du groupe", () => {
    const attacks = started.heroes.map((hero) => hero.attack)
    expect(Math.max(...attacks)).toBe(started.heroes[2].attack)
  })
})

describe('Faille - manches simultanées (règle 13)', () => {
  it('attend le choix de tous les héros debout, puis résout la manche sans attendre', () => {
    const target = firstMonster(started)
    const attack = (playerId: string): RunCommand => ({
      type: 'SubmitAction',
      playerId,
      round: started.round,
      action: { type: 'attack', target },
    })
    const one = play(started, attack('alice'))
    expect(one.events.map((e) => e.type)).toEqual(['ActionSubmitted'])
    const two = play(one.state, attack('bob'))
    const three = play(two.state, attack('carol'))
    expect(three.events.map((e) => e.type)).toContain('RoundResolved')
  })

  it('résout la manche à son échéance : un héros sans choix se défend', () => {
    const deadline = started.deadline ?? 0
    expect(deadline).toBe(T0 + ROUND_MS)
    const { events } = play(started, { type: 'CheckDeadline' }, deadline)
    const resolved = events.find((e) => e.type === 'RoundResolved')
    expect(resolved?.data).toMatchObject({
      actions: { alice: { type: 'defend' }, bob: { type: 'defend' }, carol: { type: 'defend' } },
      at: deadline,
    })
  })

  it('refuse un choix pour une manche déjà résolue, ou un second choix', () => {
    const later = settle(started, (started.deadline ?? 0) + 1).reduce(evolve, started)
    const late: RunCommand = {
      type: 'SubmitAction',
      playerId: 'alice',
      round: started.round,
      action: { type: 'defend' },
    }
    expect(decide(later, late, (started.deadline ?? 0) + 1)).toEqual({
      ok: false,
      error: { code: 'ROUND_OVER', round: later.round },
    })
    const chosen = play(started, late).state
    expect(decide(chosen, late, T0)).toEqual({ ok: false, error: { code: 'ALREADY_CHOSEN' } })
  })
})

describe('Faille - étages sans fin (règles 14 et 15)', () => {
  it('renforce les monstres à chaque étage', () => {
    const floor1 = monsterAt('ghoul', 1)
    const floor2 = monsterAt('ghoul', 2)
    const floor9 = monsterAt('ghoul', 9)
    expect(floor2.hp).toBeGreaterThan(floor1.hp)
    expect(floor9.attack).toBeGreaterThan(floor1.attack)
  })

  it('fait garder un étage sur cinq par un boss, plus puissant à chaque apparition', () => {
    const floors = Array.from({ length: 15 }, (_, i) => i + 1)
    expect(floors.filter(isBossFloor)).toEqual([5, 10, 15])
    expect(generateFloor(SEED, 5)).toEqual([monsterAt(BOSS, 5)])
    expect(generateFloor(SEED, 4).every((monster) => monster.kind !== BOSS)).toBe(true)
    const first = monsterAt(BOSS, 5)
    const second = monsterAt(BOSS, 10)
    expect(second.hp).toBeGreaterThan(first.hp)
    expect(second.attack).toBeGreaterThan(first.attack)
  })

  it("passe à l'étage suivant lorsque tous les monstres sont vaincus", () => {
    // Les monstres du premier étage sont mis à un point de vie : la prochaine attaque les achève.
    const weak = { ...started, monsters: started.monsters.map((m) => ({ ...m, hp: 1 })) }
    const choices = Object.fromEntries(
      weak.heroes.map((hero, i) => [
        hero.id,
        { type: 'attack' as const, target: weak.monsters[i % weak.monsters.length].id },
      ]),
    )
    const events = resolveRound({ ...weak, choices }, T0 + 1000)
    expect(events.map((e) => e.type)).toEqual(['RoundResolved', 'FloorEntered'])
    const after = events.reduce(evolve, weak)
    expect(after).toMatchObject({ floor: 2, floorsCleared: 1, deadline: T0 + 1000 + ROUND_MS })
  })

  it("s'achève lorsque tous les héros sont tombés, avec le nombre d'étages franchis pour score", () => {
    // Expédition abandonnée : plus personne ne choisit, chaque héros se défend à chaque
    // échéance, jusqu'à ce que le groupe tombe ; settle enregistre tout ce qui est échu.
    const events = settle(started, T0 + 24 * 60 * 60_000)
    const ended = events.at(-1)
    expect(ended?.type).toBe('RunEnded')
    const final = events.reduce(evolve, started)
    expect(final.phase).toBe('ended')
    expect(final.heroes.every((hero) => hero.hp === 0)).toBe(true)
    expect(ended?.data).toMatchObject({
      guild: 'red',
      day: DAY,
      floorsCleared: final.floorsCleared,
      heroIds: ['alice', 'bob', 'carol'],
    })
    // Une expédition achevée n'accepte plus aucune action.
    expect(decide(final, { type: 'CheckDeadline' }, T0)).toEqual({ ok: true, events: [] })
  })

  it('finit toujours par arrêter un groupe qui attaque sans relâche', () => {
    let state = started
    let now = T0
    while (state.phase === 'combat') {
      now += 1000
      for (const hero of state.heroes.filter((h) => h.hp > 0)) {
        const command: RunCommand = {
          type: 'SubmitAction',
          playerId: hero.id,
          round: state.round,
          action: { type: 'attack', target: firstMonster(state) },
        }
        state = play(state, command, now).state
        if (state.phase !== 'combat') break
      }
    }
    expect(state.phase).toBe('ended')
    expect(state.floorsCleared).toBeGreaterThan(0)
    expect(state.floorsCleared).toBeLessThan(100)
  })
})
