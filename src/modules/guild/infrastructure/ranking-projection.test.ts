import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '@/platform/db/client'
import { createEventStore, type EventStore } from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { GuildRankingReader } from '../application/guild-ranking-reader'
import { runChannel } from '../contracts'
import { createDrizzleGuildRankingReader } from './drizzle-guild-ranking-reader'
import { guildRankingProjection } from './ranking-projection'

// Chaque test dispose d'un journal neuf et d'un classement vide.
let db: Db
let store: EventStore
let reader: GuildRankingReader
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleGuildRankingReader(db, createProjectionRunner(db))
})

/** Enregistre la fin d'une expédition, réduite aux champs lus par le classement. */
async function ended(guild: string, day: string, floorsCleared: number) {
  await store.append(runChannel(crypto.randomUUID()), 0, [
    { type: 'RunEnded', data: { guild, day, floorsCleared, heroIds: [], at: 0 } },
  ])
}

/** Place d'une guilde au classement d'un jour. */
const standingOf = async (guild: string, day: string) =>
  (await reader.standings(day)).guilds.find((standing) => standing.guild === guild)

describe('Projection du classement des guildes (règle 17)', () => {
  it('retient le meilleur score de chaque guilde, et non la somme de ses expéditions', async () => {
    await ended('red', '2026-10-23', 3)
    await ended('red', '2026-10-23', 7)
    await ended('red', '2026-10-23', 5)
    await ended('green', '2026-10-23', 6)

    expect(await standingOf('red', '2026-10-23')).toEqual({
      guild: 'red',
      today: 7,
      todayRuns: 3,
      allTime: 7,
      allTimeRuns: 3,
    })
    // La guilde qui a le meilleur score du jour est en tête, quel que soit son nombre d'expéditions.
    expect((await reader.standings('2026-10-23')).guilds.map((g) => g.guild)).toEqual([
      'red',
      'green',
      'blue',
    ])
  })

  it('garde le meilleur score de tous les temps, et un classement propre à chaque jour', async () => {
    await ended('red', '2026-10-22', 12)
    await ended('red', '2026-10-23', 4)
    await ended('blue', '2026-10-23', 9)

    expect(await standingOf('red', '2026-10-23')).toMatchObject({ today: 4, allTime: 12 })
    expect((await reader.standings('2026-10-23')).guilds[0].guild).toBe('blue')
    expect((await reader.standings('2026-10-22')).guilds[0].guild).toBe('red')
  })

  it("ignore les événements d'un autre module qui porteraient le même type", async () => {
    await store.append('autre-1', 0, [
      { type: 'RunEnded', data: { guild: 'red', day: '2026-10-23', floorsCleared: 99 } },
    ])
    expect(await standingOf('red', '2026-10-23')).toMatchObject({ today: 0, todayRuns: 0 })
  })

  it('donne le même classement après une reconstruction à partir du journal', async () => {
    await ended('red', '2026-10-23', 3)
    await ended('green', '2026-10-23', 8)
    const before = await reader.standings('2026-10-23')
    await createProjectionRunner(db).rebuild(guildRankingProjection)
    expect((await reader.standings('2026-10-23')).guilds).toEqual(before.guilds)
  })
})
