import { describe, expect, it } from 'vitest'
import type { GuildRanking, RunView } from '@/modules/guild/contracts'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Durée d'un jour, en minutes, l'unité de l'horloge de test. */
const ONE_DAY = 24 * 60

/** Application de test où Alice et Bob sont dans l'Ordre du Dragon, Carol au Cercle du Chêne. */
async function guildsFormed() {
  const api = await createTestApi()
  await api.post('/api/guild/join', { guild: 'red' }, 'alice')
  await api.post('/api/guild/join', { guild: 'red' }, 'bob')
  await api.post('/api/guild/join', { guild: 'green' }, 'carol')
  return api
}

/** Ouvre et lance une expédition au nom d'un joueur seul ; renvoie son identifiant. */
async function startSolo(api: TestApi, player: string) {
  const opened = await api.post('/api/guild/rift/runs', { role: 'tank' }, player)
  const { runId } = (await opened.json()) as { runId: string }
  await api.post(`/api/guild/rift/runs/${runId}/start`, {}, player)
  return runId
}

/**
 * Mène une expédition à son terme : son héros ne choisit plus rien, se défend à chaque
 * échéance, et tombe. La commande d'échéance enregistre toutes les manches échues.
 */
async function finish(api: TestApi, runId: string, player: string) {
  api.advance(60)
  const res = await api.post(`/api/guild/rift/runs/${runId}/deadline`, {}, player)
  const { view } = (await res.json()) as { view: RunView }
  expect(view.phase).toBe('ended')
  return view.floorsCleared
}

/** Classement des guildes, tel que l'API le renvoie. */
async function ranking(api: TestApi, player = 'alice') {
  const res = await api.get('/api/guild/ranking', player)
  return (await res.json()) as GuildRanking
}

/** Place d'une guilde au classement. */
const standingOf = (board: GuildRanking, guild: string) =>
  board.guilds.find((g) => g.guild === guild)

/** Exécute la tâche quotidienne, comme la tâche planifiée de Vercel. */
async function runDailyTask(api: TestApi) {
  const res = await api.api.request('/api/cron/daily', {
    headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
  })
  return res.json()
}

describe('API du classement des guildes', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/guild/ranking', null)).status).toBe(401)
  })

  it("présente les trois guildes, même celles qui n'ont encore rien joué", async () => {
    const api = await guildsFormed()
    const board = await ranking(api)
    expect(board.guilds.map((g) => g.guild).sort()).toEqual(['blue', 'green', 'red'])
    for (const standing of board.guilds) {
      expect(standing).toMatchObject({ today: 0, todayRuns: 0, allTime: 0, allTimeRuns: 0 })
    }
  })

  it('classe les expéditions achevées de chaque guilde, jour par jour', async () => {
    const api = await guildsFormed()
    const alice = await finish(api, await startSolo(api, 'alice'), 'alice')
    const bob = await finish(api, await startSolo(api, 'bob'), 'bob')
    const carol = await finish(api, await startSolo(api, 'carol'), 'carol')

    const board = await ranking(api)
    expect(board.day).toBe('2026-01-01')
    expect(standingOf(board, 'red')).toMatchObject({
      today: Math.max(alice, bob),
      todayRuns: 2,
      allTime: Math.max(alice, bob),
    })
    expect(standingOf(board, 'green')).toMatchObject({ today: carol, todayRuns: 1 })
  })

  it('conserve le meilleur score de tous les temps, et repart de zéro chaque jour', async () => {
    const api = await guildsFormed()
    const score = await finish(api, await startSolo(api, 'alice'), 'alice')
    api.advance(ONE_DAY)

    expect(standingOf(await ranking(api), 'red')).toMatchObject({
      today: 0,
      todayRuns: 0,
      allTime: score,
      allTimeRuns: 1,
    })
  })

  it('compte, grâce à la tâche quotidienne, les expéditions abandonnées des jours passés', async () => {
    const api = await guildsFormed()
    // Alice lance une expédition, puis ferme son navigateur : aucune commande ne suit.
    const abandoned = await startSolo(api, 'alice')
    // Bob ouvre une expédition qu'il ne lance jamais.
    await api.post('/api/guild/rift/runs', { role: 'healer' }, 'bob')
    api.advance(ONE_DAY)
    expect(standingOf(await ranking(api), 'red')?.allTimeRuns).toBe(0)

    const reports = await runDailyTask(api)
    expect(reports.guild).toEqual({ ok: true, result: { messages: 0, runs: 2 } })
    expect((await (await api.get(`/api/guild/rift/runs/${abandoned}`)).json()).view.phase).toBe(
      'ended',
    )
    expect(standingOf(await ranking(api), 'red')?.allTimeRuns).toBe(2)

    // La tâche suivante n'a plus rien à clôturer.
    expect((await runDailyTask(api)).guild.result.runs).toBe(0)
  })

  it('annonce les fins d’expédition sur un canal ouvert à tout joueur connecté', async () => {
    const api = await guildsFormed()
    expect((await api.get('/api/stream/guild-ranking', 'carol')).status).toBe(200)
    expect((await api.get('/api/stream/guild-ranking', null)).status).toBe(401)
  })
})
