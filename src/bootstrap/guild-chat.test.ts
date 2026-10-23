import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { GuildMessage } from '@/modules/guild/contracts'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Application de test où Alice et Bob sont dans l'Ordre du Dragon, Carol au Cercle du Chêne. */
async function guildsFormed() {
  const api = await createTestApi()
  await api.post('/api/guild/join', { guild: 'red' }, 'alice')
  await api.post('/api/guild/join', { guild: 'red' }, 'bob')
  await api.post('/api/guild/join', { guild: 'green' }, 'carol')
  return api
}

/** Publie un message dans le chat de sa guilde, au nom d'un joueur, Alice par défaut. */
const say = (api: TestApi, body: string, player = 'alice') =>
  api.post('/api/guild/chat', { body }, player)

/** Exécute une requête SQL de lecture, et renvoie ses lignes. */
async function query(api: TestApi, statement: ReturnType<typeof sql>) {
  const result = await api.db.execute(statement)
  return (result as unknown as { rows: unknown[] }).rows
}

/** Messages du chat de la guilde d'un joueur, tels que l'API les renvoie. */
async function history(api: TestApi, player = 'alice') {
  const res = await api.get('/api/guild/chat', player)
  return ((await res.json()) as { messages: GuildMessage[] }).messages
}

describe('API du chat de guilde', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/guild/chat', null)).status).toBe(401)
    expect((await api.post('/api/guild/chat', { body: 'Bonjour' }, null)).status).toBe(401)
  })

  it("refuse le chat à un joueur qui n'a pas de guilde (403)", async () => {
    const api = await guildsFormed()
    expect((await api.get('/api/guild/chat', 'dave')).status).toBe(403)
    const res = await say(api, 'Bonjour', 'dave')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toEqual({ code: 'NOT_A_MEMBER' })
  })

  it('publie au nom du joueur connecté, dans le seul chat de sa guilde', async () => {
    const api = await guildsFormed()
    expect((await say(api, 'Rendez-vous à la Faille')).status).toBe(201)
    await say(api, 'J’arrive', 'bob')
    await say(api, 'Le Chêne vaincra', 'carol')

    expect((await history(api, 'bob')).map((m) => [m.authorName, m.body])).toEqual([
      ['alice', 'Rendez-vous à la Faille'],
      ['bob', 'J’arrive'],
    ])
    expect((await history(api, 'carol')).map((m) => m.body)).toEqual(['Le Chêne vaincra'])
  })

  it('refuse un message vide ou trop long (422), et limite les messages par joueur (429)', async () => {
    const api = await guildsFormed()
    expect((await say(api, '   ')).status).toBe(422)
    expect((await say(api, 'a'.repeat(281))).status).toBe(422)

    for (let i = 1; i <= 5; i++) expect((await say(api, `Message ${i}`)).status).toBe(201)
    const refused = await say(api, 'Message 6')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('30')
  })

  it("n'ouvre le canal temps réel d'une guilde qu'à ses membres (403)", async () => {
    const api = await guildsFormed()
    expect((await api.get('/api/stream/guild-chat-red', 'bob')).status).toBe(200)
    expect((await api.get('/api/stream/guild-chat-red', 'carol')).status).toBe(403)
    expect((await api.get('/api/stream/guild-chat-red', 'dave')).status).toBe(403)
  })

  it("diffuse sur le canal d'une guilde ses seuls messages, avec leur contenu", async () => {
    const api = await guildsFormed()
    await say(api, 'Premier')
    await say(api, 'Pour le Chêne', 'carol')
    await say(api, 'Second', 'bob')

    const res = await api.get('/api/stream/guild-chat-red/events?after=0', 'bob')
    const { events } = (await res.json()) as {
      events: { type: string; data: GuildMessage }[]
    }
    expect(events.map((e) => [e.type, e.data.body])).toEqual([
      ['GuildMessagePosted', 'Premier'],
      ['GuildMessagePosted', 'Second'],
    ])
  })

  it('supprime chaque jour les messages de plus de trente jours', async () => {
    const api = await guildsFormed()
    await say(api, 'Ancien message')
    api.advance(30 * 24 * 60 + 1)

    const res = await api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })
    expect((await res.json()).guild).toEqual({ ok: true, result: { messages: 1, runs: 0 } })
    expect(await query(api, sql`SELECT * FROM guild.messages`)).toEqual([])
  })

  it("exporte les messages du joueur, puis les supprime avec l'effacement de son compte", async () => {
    const api = await guildsFormed()
    await say(api, 'Ici Alice')
    await say(api, 'Bonjour Alice', 'bob')

    const { sections } = await (await api.get('/api/account/export')).json()
    expect(sections.guild.messages).toEqual([
      { guild: 'red', body: 'Ici Alice', postedAt: expect.any(Number) },
    ])

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    const rows = await query(api, sql`SELECT author_id FROM guild.messages`)
    expect(rows).toEqual([{ author_id: 'bob' }])
  })
})
