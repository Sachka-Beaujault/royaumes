import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import { createDrizzleMessageRepository } from '../infrastructure/drizzle-message-repository'
import { createDrizzlePresenceRepository } from '../infrastructure/drizzle-presence-repository'
import { createTavernService } from './tavern-service'

const NOW = Date.UTC(2026, 0, 1)

/** Service de la Taverne sur une base neuve, avec ou sans lecteur des guildes. */
async function tavern(guilds?: Record<string, string>) {
  const db = await createTestDatabase()
  const authorGuilds = guilds && { guildsOf: async () => guilds }
  return createTavernService(
    createDrizzleMessageRepository(db),
    createDrizzlePresenceRepository(db),
    () => NOW,
    authorGuilds,
  )
}

describe('Service de la Taverne - guilde des auteurs', () => {
  it('présente les messages sans guilde lorsque aucun lecteur des guildes ne lui est fourni', async () => {
    const service = await tavern()
    await service.post({ id: 'alice', name: 'Alice' }, 'Bonsoir')
    expect(await service.latest()).toMatchObject([{ authorName: 'Alice', authorGuild: null }])
  })

  it('lit la guilde de chaque auteur auprès du lecteur fourni', async () => {
    const service = await tavern({ alice: 'red' })
    await service.post({ id: 'alice', name: 'Alice' }, 'Bonsoir')
    await service.post({ id: 'bob', name: 'Bob' }, 'Bonsoir Alice')
    expect((await service.latest()).map((m) => m.authorGuild)).toEqual(['red', null])
  })
})
