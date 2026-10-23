import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { MemberRepository } from '../application/member-repository'
import { memberStream } from '../contracts'
import { type MemberEvent, replay } from '../domain/member'

/** Adaptateur du port MemberRepository fondé sur le journal d'événements. */
export function createEventStoreMemberRepository(store: EventStore): MemberRepository {
  return {
    async load(playerId) {
      const stored = await store.read(memberStream(playerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as MemberEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(playerId, expectedVersion, events, messages) {
      // Les événements du membre et les messages de la saga : une seule transaction.
      await store.append(
        memberStream(playerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
