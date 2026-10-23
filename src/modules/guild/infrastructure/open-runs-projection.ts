import { eq, sql } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { RUN_CHANNEL_PREFIX } from '../contracts'
import type { RunEvent } from '../domain/run'
import { openRuns } from './schema'

/** Identifiant de l'expédition tiré du nom de son flux : « guild-rift-7f3a » donne « 7f3a ». */
const runIdOf = (event: StoredEvent) => event.stream.slice(RUN_CHANNEL_PREFIX.length)

/**
 * Projection des expéditions ouvertes de la Faille, sur le modèle de celle du Donjon. Elle lit
 * les propres événements du module : ils sont donc typés par le domaine.
 * Version 2 : les expéditions lancées sont conservées jusqu'à leur fin, pour leur clôture.
 */
export const openRunsProjection: Projection = {
  name: 'guild-open-runs',
  version: 2,
  eventTypes: ['RunOpened', 'HeroJoined', 'RunStarted', 'RunEnded'],

  async apply(stored, tx) {
    // Les types d'événements sont propres au module : aucun autre flux ne les porte.
    if (!stored.stream.startsWith(RUN_CHANNEL_PREFIX)) return
    const event = { type: stored.type, data: stored.data } as RunEvent
    const runId = runIdOf(stored)

    switch (event.type) {
      case 'RunOpened':
        await tx.insert(openRuns).values({
          runId,
          guild: event.data.guild,
          day: event.data.day,
          hostName: event.data.hostName,
          heroCount: 1,
          createdAt: event.data.at,
        })
        return

      case 'HeroJoined':
        await tx
          .update(openRuns)
          .set({ heroCount: sql`${openRuns.heroCount} + 1` })
          .where(eq(openRuns.runId, runId))
        return

      // Une expédition lancée ne peut plus être rejointe, mais n'est pas encore terminée.
      case 'RunStarted':
        await tx.update(openRuns).set({ status: 'running' }).where(eq(openRuns.runId, runId))
        return

      case 'RunEnded':
        await tx.delete(openRuns).where(eq(openRuns.runId, runId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(openRuns)
  },
}
