import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { memberStream } from './contracts'
import { type MemberEvent, replay } from './domain/member'
import { messages } from './infrastructure/schema'

/** Étape de l'appartenance d'un joueur, telle qu'elle figure dans l'export. */
interface MembershipStep {
  kind: 'joined' | 'change-requested' | 'changed' | 'change-cancelled'
  /** Guilde rejointe ou demandée ; absente d'une demande annulée. */
  guild?: string
  /** Motif d'une demande annulée. */
  reason?: string
  at: number
}

/** Présente un événement de l'appartenance comme une étape de l'export. */
function stepOf(event: MemberEvent): MembershipStep {
  switch (event.type) {
    case 'GuildJoined':
      return { kind: 'joined', guild: event.data.guild, at: event.data.at }
    case 'ChangeRequested':
      return { kind: 'change-requested', guild: event.data.to, at: event.data.at }
    case 'GuildChanged':
      return { kind: 'changed', guild: event.data.to, at: event.data.at }
    case 'ChangeCancelled':
      return { kind: 'change-cancelled', reason: event.data.reason, at: event.data.at }
  }
}

/**
 * Données personnelles de la Guilde : l'appartenance du joueur à une guilde, l'historique de
 * ses changements, et ses messages dans les chats de guilde.
 * Les événements de son flux ne contiennent ni son nom ni aucune autre donnée qui l'identifie :
 * une fois son identité effacée, ils ne se rapportent plus à personne, et n'ont pas à être
 * réécrits. Ses messages, qui contiennent son nom, sont supprimés.
 */
export function createGuildPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'guild',

    async export(playerId) {
      const stored = await store.read(memberStream(playerId))
      const posted = await db
        .select({ guild: messages.guild, body: messages.body, postedAt: messages.postedAt })
        .from(messages)
        .where(eq(messages.authorId, playerId))
        .orderBy(asc(messages.id))
      if (stored.length === 0 && posted.length === 0) return null
      const events = stored.map((event) => ({ type: event.type, data: event.data }) as MemberEvent)
      return { guild: replay(events).guild, history: events.map(stepOf), messages: posted }
    },

    async erase(playerId) {
      await db.delete(messages).where(eq(messages.authorId, playerId))
    },
  }
}
