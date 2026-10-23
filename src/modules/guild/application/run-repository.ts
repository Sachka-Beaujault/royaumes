import type { RunEvent, RunState } from '../domain/run'

/** Port de persistance des expéditions de la Faille, défini par la couche application. */
export interface RunRepository {
  /** Charge l'état d'une expédition, reconstruit à partir de ses événements, et sa version. */
  load(runId: string): Promise<{ state: RunState; version: number }>

  /** Enregistre de nouveaux événements. Une ConcurrencyError est levée en cas de conflit. */
  save(runId: string, expectedVersion: number, events: RunEvent[]): Promise<void>

  /**
   * Graine secrète d'un jour de la Faille. La première expédition du jour enregistre la graine
   * proposée ; toutes les suivantes, de toutes les guildes, reçoivent cette même graine.
   */
  daySeed(day: string, proposed: number): Promise<number>
}
