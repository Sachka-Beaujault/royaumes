/**
 * Entrée publique « partagée » du module Guilde : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des constantes,
 * des schémas de validation et des fonctions pures.
 */
import { z } from 'zod'
import { GUILDS, type GuildId } from './domain/catalog'
import { MESSAGE_MAX_LENGTH } from './domain/chat'
import { ROLES } from './domain/rift-content'

export type { DayKey } from './domain/calendar'
export { dayOf, PREVIEW_DAYS, riftCalendar, riftName } from './domain/calendar'
export type { GuildId } from './domain/catalog'
export { CHANGE_COST, GUILD_INFO, GUILDS } from './domain/catalog'
export type { ChatError } from './domain/chat'
export { MESSAGE_MAX_LENGTH } from './domain/chat'
export type { MemberError } from './domain/member'
export type { RiftMonsterKind, Role } from './domain/rift-content'
export {
  BOSS_EVERY,
  MAX_HEROES,
  RIFT_MONSTERS,
  ROLE_STATS,
  ROLES,
  ROUND_MS,
} from './domain/rift-content'
export type { RunError } from './domain/rift-rules'
export type { RunAction, RunEffect, RunMonster, RunPhase } from './domain/run'
export type { RunHeroView, RunView } from './domain/run-view'
export type { MemberView } from './domain/view'

/** Corps attendu pour choisir sa première guilde, ou demander à en changer. */
export const ChooseGuildInput = z.object({
  guild: z.enum(GUILDS),
})

/** Préfixe commun aux noms des flux de tous les membres. */
export const MEMBER_STREAM_PREFIX = 'guild-member-'

/** Nom du flux qui contient les événements de l'appartenance d'un joueur. */
export const memberStream = (playerId: string) => `${MEMBER_STREAM_PREFIX}${playerId}`

/** Sujets des messages adressés à la Guilde. */
export const GUILD_TOPICS = {
  /** Réponse du Village à un mouvement de ressources. */
  transferResult: 'guild.transfer-result',
} as const

// ---------------------------------------------------------------------------
// Chat de guilde
// ---------------------------------------------------------------------------

/** Message du chat d'une guilde, tel que le reçoivent ses membres. */
export interface GuildMessage {
  /** Identifiant croissant : il ordonne les messages, et sert de position au canal temps réel. */
  id: number
  authorId: string
  authorName: string
  body: string
  postedAt: number
}

/** Corps attendu pour publier un message. La longueur exacte est vérifiée par le domaine. */
export const PostGuildMessageInput = z.object({
  body: z.string().max(MESSAGE_MAX_LENGTH * 4),
})

/** Préfixe commun aux noms des canaux temps réel des chats de guilde. */
export const GUILD_CHAT_PREFIX = 'guild-chat-'

/** Nom du canal temps réel du chat d'une guilde, réservé à ses membres. */
export const guildChatChannel = (guild: GuildId) => `${GUILD_CHAT_PREFIX}${guild}`

/** Type sous lequel un nouveau message est annoncé sur le canal. */
export const GUILD_MESSAGE_POSTED = 'GuildMessagePosted'

// ---------------------------------------------------------------------------
// La Faille
// ---------------------------------------------------------------------------

/** Expédition de la Faille qui peut encore être rejointe, telle que la présente la liste. */
export interface OpenRun {
  runId: string
  hostName: string
  heroCount: number
  createdAt: number
}

/** Corps attendu pour ouvrir ou rejoindre une expédition : le rôle choisi par le joueur. */
export const ChooseRoleInput = z.object({
  role: z.enum(ROLES),
})

/** Corps attendu pour choisir une action : la manche visée et l'action elle-même. */
export const SubmitRunActionInput = z.object({
  round: z.number().int().positive(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('attack'), target: z.string().min(1) }),
    z.object({ type: z.literal('defend') }),
    z.object({ type: z.literal('heal'), target: z.string().min(1) }),
  ]),
})

/** Préfixe commun aux noms des flux, et des canaux, de toutes les expéditions de la Faille. */
export const RUN_CHANNEL_PREFIX = 'guild-rift-'

/**
 * Nom du canal temps réel d'une expédition, identique au nom du flux qui contient ses
 * événements dans le journal.
 */
export const runChannel = (runId: string) => `${RUN_CHANNEL_PREFIX}${runId}`

/** Préfixe des flux des jours de la Faille, qui conservent la graine secrète de chaque jour. */
export const DAY_STREAM_PREFIX = 'guild-day-'

/** Nom du flux d'un jour de la Faille. */
export const dayStream = (day: string) => `${DAY_STREAM_PREFIX}${day}`

// ---------------------------------------------------------------------------
// Classement des guildes
// ---------------------------------------------------------------------------

/** Place d'une guilde au classement : ses meilleurs scores, du jour et de tous les temps. */
export interface GuildStanding {
  guild: GuildId
  /** Meilleur nombre d'étages franchis par une expédition de la guilde aujourd'hui. */
  today: number
  todayRuns: number
  /** Meilleur nombre d'étages franchis par une expédition de la guilde, tous jours confondus. */
  allTime: number
  allTimeRuns: number
}

/** Classement renvoyé par l'API, avec la position du journal jusqu'à laquelle il est à jour. */
export interface GuildRanking {
  position: number
  day: string
  guilds: GuildStanding[]
}

/** Nom du canal temps réel global du classement des guildes. */
export const GUILD_RANKING_CHANNEL = 'guild-ranking'
