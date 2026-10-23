import { max, sum } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { GuildRankingReader } from '../application/guild-ranking-reader'
import { GUILDS } from '../domain/catalog'
import { guildRankingProjection } from './ranking-projection'
import { ranking } from './schema'

/** Adaptateur du port GuildRankingReader, fondé sur la table du classement des guildes. */
export function createDrizzleGuildRankingReader(
  db: Db,
  projections: ProjectionRunner,
): GuildRankingReader {
  return {
    async standings(day) {
      // Rattrapage à la lecture, puis position lue avant la table, comme pour le Classement.
      await projections.catchUp(guildRankingProjection)
      const position = await projections.positionOf(guildRankingProjection.name)
      const rows = await db.select().from(ranking)
      const totals = await db
        .select({ guild: ranking.guild, best: max(ranking.bestFloors), runs: sum(ranking.runs) })
        .from(ranking)
        .groupBy(ranking.guild)

      // Toutes les guildes figurent au classement, même celles qui n'ont encore rien joué.
      const guilds = GUILDS.map((guild) => {
        const today = rows.find((row) => row.guild === guild && row.day === day)
        const total = totals.find((row) => row.guild === guild)
        return {
          guild,
          today: today?.bestFloors ?? 0,
          todayRuns: today?.runs ?? 0,
          allTime: total?.best ?? 0,
          allTimeRuns: Number(total?.runs ?? 0),
        }
      })
      // Classement du jour d'abord, puis de tous les temps ; l'ordre des guildes départage.
      guilds.sort((a, b) => b.today - a.today || b.allTime - a.allTime)
      return { position, day, guilds }
    },
  }
}
