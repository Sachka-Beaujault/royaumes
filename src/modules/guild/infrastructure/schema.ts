import { bigint, bigserial, index, integer, pgSchema, text } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Guilde. L'appartenance et les expéditions de la Faille sont
 * enregistrées dans le journal ; les tables de ce schéma tiennent les messages du chat,
 * destinés à disparaître (ADR 0010), et les modèles de lecture tenus par des projections.
 */
export const guild = pgSchema('guild')

/** Messages des chats de guilde, supprimés à l'expiration de leur durée de conservation. */
export const messages = guild.table(
  'messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Guilde dont le chat a reçu le message. */
    guild: text('guild').notNull(),
    authorId: text('author_id').notNull(),
    /** Nom de l'auteur au moment de la publication ; effacé avec les messages de l'auteur. */
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    postedAt: bigint('posted_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    // Le chat d'une guilde, et son canal temps réel, lisent ses messages dans l'ordre.
    index('messages_guild_idx').on(t.guild, t.id),
    // La limitation compte les messages récents d'un auteur ; l'effacement les supprime tous.
    index('messages_author_idx').on(t.authorId, t.postedAt),
    // La durée de conservation supprime les messages les plus anciens.
    index('messages_posted_at_idx').on(t.postedAt),
  ],
)

/**
 * Expéditions de la Faille qui n'ont été ni lancées ni terminées, tenues à jour par la
 * projection des expéditions ouvertes. Une expédition quitte la table dès son lancement.
 */
export const openRuns = guild.table(
  'open_runs',
  {
    runId: text('run_id').primaryKey(),
    guild: text('guild').notNull(),
    /** Jour de la Faille : une expédition ne peut être rejointe que le jour de son ouverture. */
    day: text('day').notNull(),
    hostName: text('host_name').notNull(),
    heroCount: integer('hero_count').notNull(),
    /** Date d'ouverture, en millisecondes, comme le champ at des événements. */
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  // La liste ne présente que les expéditions d'une guilde, ouvertes le jour même.
  (t) => [index('open_runs_guild_day_idx').on(t.guild, t.day)],
)
