import type { NewMessage } from '@/platform/outbox/outbox'
import type { MemberEvent, MemberState } from '../domain/member'

/** Port de persistance des membres, défini par la couche application. */
export interface MemberRepository {
  /** Charge l'état d'un membre, reconstruit à partir de ses événements, et sa version. */
  load(playerId: string): Promise<{ state: MemberState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    playerId: string,
    expectedVersion: number,
    events: MemberEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
