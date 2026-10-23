import { and, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { OpenRunsReader } from '../application/open-runs-reader'
import { MAX_HEROES } from '../domain/rift-content'
import { openRunsProjection } from './open-runs-projection'
import { openRuns } from './schema'

/** Adaptateur du port OpenRunsReader, fondé sur la table des expéditions ouvertes. */
export function createDrizzleOpenRunsReader(db: Db, projections: ProjectionRunner): OpenRunsReader {
  return {
    async list(guild, day) {
      // Rattrapage à la lecture, comme pour les autres projections.
      await projections.catchUp(openRunsProjection)

      // Une expédition complète reste dans la table, mais n'est pas proposée.
      return db
        .select({
          runId: openRuns.runId,
          hostName: openRuns.hostName,
          heroCount: openRuns.heroCount,
          createdAt: openRuns.createdAt,
        })
        .from(openRuns)
        .where(
          and(
            eq(openRuns.guild, guild),
            eq(openRuns.day, day),
            eq(openRuns.status, 'lobby'),
            lt(openRuns.heroCount, MAX_HEROES),
          ),
        )
        .orderBy(desc(openRuns.createdAt))
    },

    async unfinishedBefore(day) {
      await projections.catchUp(openRunsProjection)
      // Les jours sont comparés comme des chaînes : la forme AAAA-MM-JJ suit l'ordre des dates.
      const rows = await db
        .select({ runId: openRuns.runId })
        .from(openRuns)
        .where(lt(openRuns.day, day))
      return rows.map((row) => row.runId)
    },
  }
}
