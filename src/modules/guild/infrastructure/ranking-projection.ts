import { sql } from 'drizzle-orm'
import type { Projection } from '@/platform/projection/projection'
import { RUN_CHANNEL_PREFIX } from '../contracts'
import type { RunEvent } from '../domain/run'
import { ranking } from './schema'

/**
 * Projection du classement des guildes. Elle ne lit que la fin des expéditions de la Faille :
 * chaque guilde garde, pour chaque jour, le meilleur score de ses expéditions, et non leur
 * somme (règle 17). Version 1.
 */
export const guildRankingProjection: Projection = {
  name: 'guild-ranking',
  version: 1,
  eventTypes: ['RunEnded'],

  async apply(stored, tx) {
    if (!stored.stream.startsWith(RUN_CHANNEL_PREFIX)) return
    const event = { type: stored.type, data: stored.data } as RunEvent
    if (event.type !== 'RunEnded') return
    const { guild, day, floorsCleared } = event.data
    await tx
      .insert(ranking)
      .values({ guild, day, bestFloors: floorsCleared, runs: 1 })
      .onConflictDoUpdate({
        target: [ranking.guild, ranking.day],
        set: {
          bestFloors: sql`greatest(${ranking.bestFloors}, ${floorsCleared})`,
          runs: sql`${ranking.runs} + 1`,
        },
      })
  },

  async reset(tx) {
    await tx.delete(ranking)
  },
}
