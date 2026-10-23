import { asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { memberStream, RUN_CHANNEL_PREFIX, runChannel } from './contracts'
import { type MemberEvent, replay } from './domain/member'
import { type RunEvent, replayRun } from './domain/run'
import { messages, openRuns } from './infrastructure/schema'

/** Étape de l'appartenance d'un joueur, telle qu'elle figure dans l'export. */
interface MembershipStep {
  kind:
    | 'joined'
    | 'change-requested'
    | 'changed'
    | 'change-cancelled'
    | 'rift-entered'
    | 'rift-entry-cancelled'
  /** Guilde rejointe ou demandée ; absente d'une demande annulée. */
  guild?: string
  /** Motif d'une demande annulée. */
  reason?: string
  /** Jour d'une participation à la Faille. */
  day?: string
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
    case 'RiftEntered':
      return { kind: 'rift-entered', day: event.data.day, at: event.data.at }
    case 'RiftEntryCancelled':
      return { kind: 'rift-entry-cancelled', day: event.data.day, at: event.data.at }
  }
}

/** Participation d'un joueur à une expédition de la Faille, telle qu'elle figure dans l'export. */
interface Expedition {
  runId: string
  day: string
  role: string
  /** Score de l'expédition ; null tant qu'elle n'est pas achevée. */
  floorsCleared: number | null
}

/** Identifiant de l'expédition d'un événement de la Faille. */
const runIdOf = (event: StoredEvent) => event.stream.slice(RUN_CHANNEL_PREFIX.length)

/**
 * Données personnelles de la Guilde : l'appartenance du joueur à une guilde, l'historique de
 * ses changements et de ses participations à la Faille, ses messages dans les chats de guilde,
 * et son nom, copié dans les événements des expéditions qu'il a ouvertes ou rejointes.
 * Les événements de son flux d'appartenance ne contiennent ni son nom ni aucune autre donnée
 * qui l'identifie : une fois son identité effacée, ils ne se rapportent plus à personne, et
 * n'ont pas à être réécrits. Ses messages, qui contiennent son nom, sont supprimés.
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

      // Les expéditions sont retrouvées par les participations du flux d'appartenance, sans
      // parcourir le journal ; l'export n'en présente que la participation du joueur.
      const expeditions: Expedition[] = []
      for (const event of events) {
        if (event.type !== 'RiftEntered') continue
        const run = (await store.read(runChannel(event.data.runId))).map(
          (e) => ({ type: e.type, data: e.data }) as RunEvent,
        )
        const hero = replayRun(run).heroes.find((h) => h.id === playerId)
        if (!hero) continue
        const ended = run.find((e) => e.type === 'RunEnded')
        expeditions.push({
          runId: event.data.runId,
          day: event.data.day,
          role: hero.role,
          floorsCleared: ended?.type === 'RunEnded' ? ended.data.floorsCleared : null,
        })
      }

      return {
        guild: replay(events).guild,
        history: events.map(stepOf),
        expeditions,
        messages: posted,
      }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(RUN_CHANNEL_PREFIX)) return null
      if (event.type === 'RunOpened' && event.data.hostId === playerId) {
        return event.data.hostName === ERASED_NAME ? null : { ...event.data, hostName: ERASED_NAME }
      }
      if (event.type === 'HeroJoined' && event.data.playerId === playerId) {
        return event.data.name === ERASED_NAME ? null : { ...event.data, name: ERASED_NAME }
      }
      return null
    },

    // Les messages du joueur sont supprimés ; la liste des expéditions ouvertes contient le nom
    // de l'hôte : celui des expéditions dont l'événement RunOpened vient d'être réécrit est remplacé.
    async erase(playerId, rewritten) {
      await db.delete(messages).where(eq(messages.authorId, playerId))
      const hosted = rewritten
        .filter(
          (event) => event.type === 'RunOpened' && event.stream.startsWith(RUN_CHANNEL_PREFIX),
        )
        .map(runIdOf)
      if (hosted.length === 0) return
      await db
        .update(openRuns)
        .set({ hostName: ERASED_NAME })
        .where(inArray(openRuns.runId, hosted))
    },
  }
}
