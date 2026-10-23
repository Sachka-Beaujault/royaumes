import { describe, expect, it } from 'vitest'
import type { MemberView } from '@/modules/guild/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Vue de l'appartenance d'un joueur. */
async function viewOf(api: TestApi, player = 'alice') {
  const res = await api.get('/api/guild', player)
  return ((await res.json()) as { view: MemberView }).view
}

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player = 'alice'): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/**
 * Donne à Alice un village qui a produit 60 pièces d'or : elle le fonde, attend dix minutes
 * la pierre de sa mine, la construit, puis attend trente minutes sa production.
 */
async function aliceHasGold(api: TestApi) {
  await api.post('/api/realm/village', { name: 'Valombre' })
  api.advance(10)
  await api.post('/api/realm/village/upgrade', { building: 'mine' })
  api.advance(30)
}

describe('API du module Guilde', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/guild', null)).status).toBe(401)
    expect((await api.post('/api/guild/join', { guild: 'red' }, null)).status).toBe(401)
    expect((await api.post('/api/guild/change', { guild: 'red' }, null)).status).toBe(401)
  })

  it("présente un joueur sans guilde tant qu'il n'en a choisi aucune", async () => {
    const api = await createTestApi()
    expect(await viewOf(api)).toEqual({ guild: null, pendingTo: null, missing: null })
  })

  it('enregistre le premier choix (201), gratuit, et refuse un second choix (409)', async () => {
    const api = await createTestApi()
    const res = await api.post('/api/guild/join', { guild: 'red' })
    expect(res.status).toBe(201)
    expect((await res.json()).view).toEqual({ guild: 'red', pendingTo: null, missing: null })

    const again = await api.post('/api/guild/join', { guild: 'blue' })
    expect(again.status).toBe(409)
    expect((await again.json()).error).toEqual({ code: 'ALREADY_MEMBER' })
  })

  it('refuse une guilde inconnue (400)', async () => {
    const api = await createTestApi()
    const res = await api.post('/api/guild/join', { guild: 'purple' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
  })

  it("change le joueur de guilde contre 50 pièces d'or prélevées dans son village", async () => {
    const api = await createTestApi()
    await aliceHasGold(api)
    await api.post('/api/guild/join', { guild: 'red' })

    const res = await api.post('/api/guild/change', { guild: 'green' })
    expect(res.status).toBe(200)
    expect((await res.json()).view).toEqual({ guild: 'green', pendingTo: null, missing: null })
    expect((await stockOf(api)).gold).toBe(10)
  })

  it("laisse le joueur dans sa guilde, et lui indique l'or manquant, si son village est trop pauvre", async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' })
    await api.post('/api/guild/join', { guild: 'red' })

    const res = await api.post('/api/guild/change', { guild: 'green' })
    expect((await res.json()).view).toEqual({
      guild: 'red',
      pendingTo: null,
      missing: { gold: 50 },
    })
  })

  it('refuse un changement vers sa guilde, ou sans guilde (409)', async () => {
    const api = await createTestApi()
    const without = await api.post('/api/guild/change', { guild: 'red' })
    expect((await without.json()).error).toEqual({ code: 'NOT_A_MEMBER' })

    await api.post('/api/guild/join', { guild: 'red' })
    const same = await api.post('/api/guild/change', { guild: 'red' })
    expect(same.status).toBe(409)
    expect((await same.json()).error).toEqual({ code: 'SAME_GUILD' })
  })

  it("n'agit qu'au nom du joueur connecté : un autre joueur n'est pas concerné", async () => {
    const api = await createTestApi()
    await api.post('/api/guild/join', { guild: 'red', playerId: 'bob' })
    expect(await viewOf(api, 'alice')).toMatchObject({ guild: 'red' })
    expect(await viewOf(api, 'bob')).toMatchObject({ guild: null })
  })

  it('change le joueur de guilde avec le Village extrait en service', async () => {
    const api = await createTestApi({ villageService: true })
    await aliceHasGold(api)
    await api.post('/api/guild/join', { guild: 'blue' })

    const res = await api.post('/api/guild/change', { guild: 'red' })
    expect((await res.json()).view).toEqual({ guild: 'red', pendingTo: null, missing: null })
    expect((await stockOf(api)).gold).toBe(10)
  })

  it("inclut l'appartenance à une guilde dans l'export des données du joueur", async () => {
    const api = await createTestApi()
    await api.post('/api/guild/join', { guild: 'green' })

    const { sections } = await (await api.get('/api/account/export')).json()
    expect(sections.guild).toEqual({
      guild: 'green',
      history: [{ kind: 'joined', guild: 'green', at: expect.any(Number) }],
      messages: [],
    })
  })
})
