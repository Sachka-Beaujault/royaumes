import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type OpenRun, ROUND_MS, type RunView, riftName } from '@/modules/guild/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Jour de jeu de l'horloge de test, qui part du 1er janvier 2026 à minuit UTC (1 h à Paris). */
const DAY = '2026-01-01'

/** Application de test où Alice et Bob sont dans l'Ordre du Dragon, Carol au Cercle du Chêne. */
async function guildsFormed() {
  const api = await createTestApi()
  await api.post('/api/guild/join', { guild: 'red' }, 'alice')
  await api.post('/api/guild/join', { guild: 'red' }, 'bob')
  await api.post('/api/guild/join', { guild: 'green' }, 'carol')
  return api
}

/** Ouvre une expédition au nom d'un joueur, Alice par défaut, avec le rôle choisi. */
async function openRun(api: TestApi, player = 'alice', role = 'tank') {
  const res = await api.post('/api/guild/rift/runs', { role }, player)
  return { status: res.status, ...((await res.json()) as { runId: string; view: RunView }) }
}

/** Vue d'une expédition pour un joueur. */
async function viewOf(api: TestApi, runId: string, player = 'alice') {
  const res = await api.get(`/api/guild/rift/runs/${runId}`, player)
  return ((await res.json()) as { view: RunView }).view
}

/** Faille du jour, et expéditions ouvertes de la guilde d'un joueur. */
async function overview(api: TestApi, player = 'alice') {
  const res = await api.get('/api/guild/rift', player)
  return (await res.json()) as {
    calendar: { day: string; name: string }[]
    runs: OpenRun[]
    enteredToday: boolean
  }
}

/** Exécute une requête SQL de lecture, et renvoie ses lignes. */
async function query(api: TestApi, statement: ReturnType<typeof sql>) {
  const result = await api.db.execute(statement)
  return (result as unknown as { rows: Record<string, unknown>[] }).rows
}

describe('API de la Faille', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/guild/rift', null)).status).toBe(401)
    expect((await api.post('/api/guild/rift/runs', { role: 'tank' }, null)).status).toBe(401)
  })

  it('présente la Faille du jour et les noms des sept jours suivants', async () => {
    const api = await guildsFormed()
    const { calendar, runs, enteredToday } = await overview(api)
    expect(calendar).toHaveLength(8)
    expect(calendar[0]).toEqual({ day: DAY, name: riftName(DAY) })
    expect(runs).toEqual([])
    expect(enteredToday).toBe(false)
  })

  it('refuse la Faille à un joueur sans guilde (403), et un rôle inconnu (400)', async () => {
    const api = await guildsFormed()
    const without = await openRun(api, 'dave')
    expect(without.status).toBe(403)
    expect((await api.post('/api/guild/rift/runs', { role: 'mage' })).status).toBe(400)
  })

  it("ouvre une expédition (201), proposée aux seuls membres de la guilde de l'hôte", async () => {
    const api = await guildsFormed()
    const { status, runId, view } = await openRun(api)
    expect(status).toBe(201)
    expect(view).toMatchObject({
      phase: 'lobby',
      name: riftName(DAY),
      guild: 'red',
      isHost: true,
      heroes: [{ id: 'alice', role: 'tank' }],
    })
    expect((await overview(api, 'bob')).runs).toMatchObject([{ runId, heroCount: 1 }])
    expect((await overview(api, 'carol')).runs).toEqual([])
  })

  it("refuse un joueur d'une autre guilde (403), sans lui retirer sa participation du jour", async () => {
    const api = await guildsFormed()
    const { runId } = await openRun(api)
    const res = await api.post(`/api/guild/rift/runs/${runId}/join`, { role: 'healer' }, 'carol')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toEqual({ code: 'WRONG_GUILD' })
    expect((await openRun(api, 'carol')).status).toBe(201)
  })

  it("n'accepte qu'une participation par joueur et par jour (409), puis une le lendemain", async () => {
    const api = await guildsFormed()
    const { runId } = await openRun(api)
    expect(
      (await api.post(`/api/guild/rift/runs/${runId}/join`, { role: 'healer' }, 'bob')).status,
    ).toBe(200)

    const second = await openRun(api, 'bob')
    expect(second.status).toBe(409)
    expect((await overview(api, 'bob')).enteredToday).toBe(true)

    api.advance(24 * 60)
    expect((await openRun(api, 'bob')).status).toBe(201)
  })

  it("fige la guilde d'un joueur qui a rejoint la Faille aujourd'hui (409)", async () => {
    const api = await guildsFormed()
    await openRun(api)
    const res = await api.post('/api/guild/change', { guild: 'blue' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toEqual({ code: 'GUILD_LOCKED' })
  })

  it("lance l'expédition, résout les manches, et la retire des expéditions ouvertes", async () => {
    const api = await guildsFormed()
    const { runId } = await openRun(api)
    await api.post(`/api/guild/rift/runs/${runId}/join`, { role: 'attacker' }, 'bob')
    expect((await api.post(`/api/guild/rift/runs/${runId}/start`, {}, 'bob')).status).toBe(403)

    const started = await api.post(`/api/guild/rift/runs/${runId}/start`, {})
    const view = ((await started.json()) as { view: RunView }).view
    expect(view).toMatchObject({ phase: 'combat', floor: 1, round: 1 })
    expect((await overview(api, 'bob')).runs).toEqual([])

    // Alice attaque ; Bob ne choisit rien : à l'échéance, il se défend.
    const target = view.monsters[0].id
    const action = { round: 1, action: { type: 'attack', target } }
    const chosen = await api.post(`/api/guild/rift/runs/${runId}/action`, action)
    expect(((await chosen.json()) as { view: RunView }).view.heroes[0]).toMatchObject({
      ready: true,
      action: { type: 'attack', target },
    })
    // Bob voit qu'Alice a choisi, mais pas son action.
    expect((await viewOf(api, runId, 'bob')).heroes[0]).toMatchObject({ ready: true, action: null })

    api.advance(ROUND_MS / 60_000)
    const due = await api.post(`/api/guild/rift/runs/${runId}/deadline`, {}, 'bob')
    const after = ((await due.json()) as { view: RunView }).view
    expect(after.lastRound?.actions).toMatchObject({ bob: { type: 'defend' } })
  })

  it('refuse une action sur une cible inexistante (422)', async () => {
    const api = await guildsFormed()
    const { runId } = await openRun(api)
    await api.post(`/api/guild/rift/runs/${runId}/start`, {})
    const res = await api.post(`/api/guild/rift/runs/${runId}/action`, {
      round: 1,
      action: { type: 'attack', target: 'm9' },
    })
    expect(res.status).toBe(422)
  })

  it('présente la même Faille à toutes les guildes, sans jamais transmettre sa graine', async () => {
    const api = await guildsFormed()
    const red = await openRun(api, 'alice')
    const green = await openRun(api, 'carol', 'attacker')
    const startRed = await api.post(`/api/guild/rift/runs/${red.runId}/start`, {}, 'alice')
    const startGreen = await api.post(`/api/guild/rift/runs/${green.runId}/start`, {}, 'carol')
    const redView = ((await startRed.json()) as { view: RunView }).view
    const greenView = ((await startGreen.json()) as { view: RunView }).view

    expect(greenView.monsters).toEqual(redView.monsters)
    expect(JSON.stringify(redView)).not.toContain('seed')
    // Une seule graine est enregistrée pour le jour, quelle que soit la guilde.
    expect(
      await query(api, sql`SELECT stream FROM platform.events WHERE type = 'DaySeeded'`),
    ).toEqual([{ stream: `guild-day-${DAY}` }])
  })

  it("réserve le canal d'une expédition à ses héros (403)", async () => {
    const api = await guildsFormed()
    const { runId } = await openRun(api)
    expect((await api.get(`/api/stream/guild-rift-${runId}`, 'alice')).status).toBe(200)
    expect((await api.get(`/api/stream/guild-rift-${runId}`, 'bob')).status).toBe(403)
    expect((await api.get(`/api/stream/guild-rift-${runId}`, 'carol')).status).toBe(403)
  })

  it('exporte les expéditions du joueur, puis efface son nom des expéditions', async () => {
    const api = await guildsFormed()
    const { runId } = await openRun(api)

    const { sections } = await (await api.get('/api/account/export')).json()
    expect(sections.guild.expeditions).toEqual([
      { runId, day: DAY, role: 'tank', floorsCleared: null },
    ])

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    expect((await viewOf(api, runId, 'bob')).heroes[0].name).toBe('Joueur effacé')
    expect((await overview(api, 'bob')).runs).toMatchObject([{ runId, hostName: 'Joueur effacé' }])
  })
})
