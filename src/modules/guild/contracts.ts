/**
 * Entrée publique « partagée » du module Guilde : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des constantes,
 * des schémas de validation et des fonctions pures.
 */
import { z } from 'zod'
import { GUILDS, type GuildId } from './domain/catalog'
import { MESSAGE_MAX_LENGTH } from './domain/chat'

export type { DayKey } from './domain/calendar'
export { dayOf, PREVIEW_DAYS, riftCalendar } from './domain/calendar'
export type { GuildId } from './domain/catalog'
export { CHANGE_COST, GUILD_INFO, GUILDS } from './domain/catalog'
export type { ChatError } from './domain/chat'
export { MESSAGE_MAX_LENGTH } from './domain/chat'
export type { MemberError } from './domain/member'
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
