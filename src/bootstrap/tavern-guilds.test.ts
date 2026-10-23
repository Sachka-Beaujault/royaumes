import { describe, expect, it } from 'vitest'
import type { TavernMessage } from '@/modules/tavern/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Publie un message dans la Taverne, au nom d'un joueur. */
const say = (api: TestApi, body: string, player: string) =>
  api.post('/api/tavern/messages', { body }, player)

/** Guilde de l'auteur de chaque message de la Taverne, dans l'ordre des messages. */
async function guildsInTavern(api: TestApi) {
  const res = await api.get('/api/tavern/messages', 'carol')
  const { messages } = (await res.json()) as { messages: TavernMessage[] }
  return messages.map((m) => [m.authorName, m.authorGuild])
}

describe('La Taverne et les guildes (règle 18)', () => {
  it("présente la guilde de chaque auteur, ou aucune s'il n'en a pas choisi", async () => {
    const api = await createTestApi()
    await api.post('/api/guild/join', { guild: 'red' }, 'alice')
    await api.post('/api/guild/join', { guild: 'blue' }, 'bob')
    await say(api, 'Pour le Dragon !', 'alice')
    await say(api, "Vive l'Onde", 'bob')
    await say(api, 'Je ne suis de personne', 'dave')

    expect(await guildsInTavern(api)).toEqual([
      ['alice', 'red'],
      ['bob', 'blue'],
      ['dave', null],
    ])
  })

  it("présente la guilde actuelle de l'auteur, et non celle du jour de son message", async () => {
    const api = await createTestApi()
    await say(api, 'Bonsoir', 'alice')
    expect(await guildsInTavern(api)).toEqual([['alice', null]])

    await api.post('/api/guild/join', { guild: 'green' }, 'alice')
    expect(await guildsInTavern(api)).toEqual([['alice', 'green']])
  })

  it('joint la guilde de l’auteur au message publié et au message diffusé sur le canal', async () => {
    const api = await createTestApi()
    await api.post('/api/guild/join', { guild: 'red' }, 'alice')
    const posted = await say(api, 'Premier', 'alice')
    expect(((await posted.json()) as { message: TavernMessage }).message.authorGuild).toBe('red')

    const res = await api.get('/api/stream/tavern/events?after=0', 'carol')
    const { events } = (await res.json()) as { events: { data: TavernMessage }[] }
    expect(events.map((e) => e.data.authorGuild)).toEqual(['red'])
  })
})
