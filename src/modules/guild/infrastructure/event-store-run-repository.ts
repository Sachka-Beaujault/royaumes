import {
  ConcurrencyError,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import type { RunRepository } from '../application/run-repository'
import { dayStream, runChannel } from '../contracts'
import { type RunEvent, replayRun } from '../domain/run'

/**
 * Adaptateur du port RunRepository fondé sur le journal d'événements : un flux par expédition,
 * et un flux par jour, dont l'unique événement DaySeeded conserve la graine du jour.
 */
export function createEventStoreRunRepository(store: EventStore): RunRepository {
  /** Graine enregistrée pour un jour ; null si aucune expédition n'a encore été ouverte. */
  async function storedSeed(day: string) {
    const [seeded] = await store.read(dayStream(day))
    return seeded ? (seeded.data.seed as number) : null
  }

  return {
    async load(runId) {
      const stored = await store.read(runChannel(runId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as RunEvent)
      return { state: replayRun(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(runId, expectedVersion, events) {
      await store.append(runChannel(runId), expectedVersion, events as unknown as NewEvent[])
    },

    async daySeed(day, proposed) {
      const existing = await storedSeed(day)
      if (existing !== null) return existing
      try {
        // La version attendue 0 garantit qu'une seule graine est enregistrée pour le jour :
        // de deux premières expéditions simultanées, la seconde reçoit la graine de la première.
        await store.append(dayStream(day), 0, [
          { type: 'DaySeeded', data: { day, seed: proposed } },
        ])
        return proposed
      } catch (error) {
        if (!(error instanceof ConcurrencyError)) throw error
        return (await storedSeed(day)) ?? proposed
      }
    },
  }
}
