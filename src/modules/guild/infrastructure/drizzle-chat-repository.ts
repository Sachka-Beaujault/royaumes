import { and, asc, desc, eq, gt, gte, lt, max } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ChatRepository } from '../application/chat-repository'
import { messages } from './schema'

/** Colonnes d'un message présentées aux joueurs : la guilde est implicite. */
const columns = {
  id: messages.id,
  authorId: messages.authorId,
  authorName: messages.authorName,
  body: messages.body,
  postedAt: messages.postedAt,
}

/** Adaptateur du port ChatRepository, fondé sur la table guild.messages. */
export function createDrizzleChatRepository(db: Db): ChatRepository {
  return {
    async add(message) {
      const [row] = await db.insert(messages).values(message).returning(columns)
      return row
    },

    async latest(guild, limit) {
      // Les derniers messages sont lus du plus récent au plus ancien, puis remis dans l'ordre.
      const rows = await db
        .select(columns)
        .from(messages)
        .where(eq(messages.guild, guild))
        .orderBy(desc(messages.id))
        .limit(limit)
      return rows.reverse()
    },

    after(guild, id, limit) {
      return db
        .select(columns)
        .from(messages)
        .where(and(eq(messages.guild, guild), gt(messages.id, id)))
        .orderBy(asc(messages.id))
        .limit(limit)
    },

    async lastId() {
      const [row] = await db.select({ value: max(messages.id) }).from(messages)
      return Number(row?.value ?? 0)
    },

    async postedSince(authorId, since) {
      const rows = await db
        .select({ postedAt: messages.postedAt })
        .from(messages)
        .where(and(eq(messages.authorId, authorId), gte(messages.postedAt, since)))
      return rows.map((row) => row.postedAt)
    },

    async removeOlderThan(before) {
      const removed = await db
        .delete(messages)
        .where(lt(messages.postedAt, before))
        .returning({ id: messages.id })
      return removed.length
    },
  }
}
