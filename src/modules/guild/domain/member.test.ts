import { describe, expect, it } from 'vitest'
import { CHANGE_COST } from './catalog'
import {
  decide,
  evolve,
  initialState,
  type MemberCommand,
  type MemberState,
  playerIdOf,
  transferIdOf,
} from './member'
import { requestsFor } from './saga'

const T0 = Date.UTC(2026, 0, 1)

/** Applique une commande acceptée ; renvoie le nouvel état et les demandes de la saga. */
function play(state: MemberState, command: MemberCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

const join: MemberCommand = { type: 'JoinGuild', playerId: 'alice', guild: 'red' }
const toBlue: MemberCommand = { type: 'RequestChange', playerId: 'alice', guild: 'blue' }
const result = (
  transferId: string,
  outcome: 'withdrawn' | 'refused',
  missing?: Record<string, number>,
): MemberCommand => ({ type: 'RecordTransferResult', transferId, outcome, missing })

// Alice a rejoint l'Ordre du Dragon, puis demandé à passer à la Garde de l'Onde.
const member = play(initialState, join).state
const pending = play(member, toBlue).state

describe('Guilde - premier choix (règles 1 et 2)', () => {
  it("rejoint une guilde gratuitement : aucun prélèvement n'est demandé au Village", () => {
    const { state, requests } = play(initialState, join)
    expect(state).toMatchObject({ exists: true, playerId: 'alice', guild: 'red', pending: null })
    expect(requests).toEqual([])
  })

  it("refuse un second premier choix : un joueur n'appartient qu'à une guilde", () => {
    const again: MemberCommand = { type: 'JoinGuild', playerId: 'alice', guild: 'green' }
    expect(decide(member, again, T0)).toEqual({ ok: false, error: { code: 'ALREADY_MEMBER' } })
  })

  it("refuse une demande de changement à un joueur qui n'a pas encore de guilde", () => {
    expect(decide(initialState, toBlue, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    })
  })
})

describe('Guilde - changement payant (règle 3)', () => {
  it('demande le prélèvement du prix du changement, sans changer encore de guilde', () => {
    const { state, requests } = play(member, toBlue)
    expect(state).toMatchObject({ guild: 'red', pending: { attempt: 1, to: 'blue' } })
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'guild-alice:change-1',
        playerId: 'alice',
        resources: CHANGE_COST,
      },
    ])
  })

  it('change de guilde lorsque le Village a prélevé le prix', () => {
    const { state, requests } = play(pending, result('guild-alice:change-1', 'withdrawn'))
    expect(state).toMatchObject({ guild: 'blue', pending: null })
    expect(requests).toEqual([])
  })

  it('annule la demande si le village ne peut pas payer : le joueur reste dans sa guilde', () => {
    const refused = result('guild-alice:change-1', 'refused', { gold: 20 })
    const { state, requests } = play(pending, refused)
    expect(state).toMatchObject({
      guild: 'red',
      pending: null,
      lastCancel: { reason: 'refused', missing: { gold: 20 } },
    })
    // Rien n'a été prélevé : il n'y a rien à compenser.
    expect(requests).toEqual([])
  })

  it("attribue à chaque demande son propre mouvement, après l'annulation de la précédente", () => {
    const cancelled = play(pending, result('guild-alice:change-1', 'refused')).state
    const { requests } = play(cancelled, toBlue)
    expect(requests).toMatchObject([{ kind: 'withdraw', transferId: 'guild-alice:change-2' }])
  })

  it('ignore une réponse en double, ou qui ne correspond pas à la demande en cours', () => {
    const changed = play(pending, result('guild-alice:change-1', 'withdrawn')).state
    const duplicate = result('guild-alice:change-1', 'withdrawn')
    expect(decide(changed, duplicate, T0)).toEqual({ ok: true, events: [] })
    expect(decide(pending, result('guild-alice:change-7', 'withdrawn'), T0)).toEqual({
      ok: true,
      events: [],
    })
  })
})

describe('Guilde - demandes refusées (règle 4)', () => {
  it('refuse un changement vers la guilde actuelle', () => {
    const same: MemberCommand = { type: 'RequestChange', playerId: 'alice', guild: 'red' }
    expect(decide(member, same, T0)).toEqual({ ok: false, error: { code: 'SAME_GUILD' } })
  })

  it('refuse une seconde demande tant que la première attend la réponse du Village', () => {
    const toGreen: MemberCommand = { type: 'RequestChange', playerId: 'alice', guild: 'green' }
    expect(decide(pending, toGreen, T0)).toEqual({
      ok: false,
      error: { code: 'CHANGE_PENDING' },
    })
  })
})

describe('Guilde - identifiants des mouvements', () => {
  it("retrouve le joueur d'un mouvement, même si son identifiant contient un deux-points", () => {
    expect(playerIdOf(transferIdOf('alice', 'change-1'))).toBe('alice')
    expect(playerIdOf(transferIdOf('a:b', 'change-3'))).toBe('a:b')
  })
})

describe('Guilde - participation à la Faille (règles 4, 5, 6 et 16)', () => {
  const NOON = Date.UTC(2026, 9, 23, 10, 0)
  const TOMORROW = NOON + 24 * 60 * 60_000
  const enter = (runId: string): MemberCommand => ({ type: 'EnterRift', runId })

  it("refuse la Faille à un joueur qui n'a pas de guilde", () => {
    expect(decide(initialState, enter('r1'), NOON)).toEqual({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    })
  })

  it("n'accepte qu'une participation par jour, et une nouvelle le lendemain", () => {
    const entered = play(member, enter('r1'), NOON).state
    expect(entered.rift).toEqual({ day: '2026-10-23', runId: 'r1' })
    expect(decide(entered, enter('r2'), NOON + 60_000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_ENTERED_TODAY' },
    })
    expect(decide(entered, enter('r2'), TOMORROW).ok).toBe(true)
  })

  it('compte la participation du jour même si le joueur change ensuite de guilde', () => {
    // Alice change de guilde le matin, puis joue pour sa nouvelle guilde : elle ne peut pas
    // rejouer pour l'ancienne, ni pour aucune autre, le même jour.
    const moved = play(pending, result('guild-alice:change-1', 'withdrawn'), NOON).state
    const entered = play(moved, enter('r1'), NOON).state
    expect(entered.guild).toBe('blue')
    expect(decide(entered, enter('r2'), NOON).ok).toBe(false)
  })

  it("fige la guilde jusqu'au lendemain une fois la Faille rejointe", () => {
    const entered = play(member, enter('r1'), NOON).state
    expect(decide(entered, toBlue, NOON)).toEqual({ ok: false, error: { code: 'GUILD_LOCKED' } })
    expect(decide(entered, toBlue, TOMORROW).ok).toBe(true)
  })

  it('rend la participation si l’inscription à l’expédition a échoué', () => {
    const entered = play(member, enter('r1'), NOON).state
    const cancelled = play(entered, { type: 'CancelRiftEntry', runId: 'r1' }, NOON).state
    expect(cancelled.rift).toBeNull()
    expect(decide(cancelled, enter('r2'), NOON).ok).toBe(true)
    // L'annulation d'une autre participation que celle en cours est sans effet.
    expect(decide(entered, { type: 'CancelRiftEntry', runId: 'r9' }, NOON)).toEqual({
      ok: true,
      events: [],
    })
  })

  it("annule un changement en attente si le joueur rejoint la Faille, et rembourse l'or", () => {
    const entered = play(pending, enter('r1'), NOON).state
    const { state, requests } = play(entered, result('guild-alice:change-1', 'withdrawn'), NOON)
    expect(state).toMatchObject({
      guild: 'red',
      pending: null,
      lastCancel: { reason: 'locked' },
    })
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'guild-alice:refund-1',
        playerId: 'alice',
        resources: CHANGE_COST,
      },
    ])
  })

  it("n'a rien à rembourser si le Village a refusé le prélèvement", () => {
    const entered = play(pending, enter('r1'), NOON).state
    const { state, requests } = play(entered, result('guild-alice:change-1', 'refused'), NOON)
    expect(state.lastCancel?.reason).toBe('refused')
    expect(requests).toEqual([])
  })
})
