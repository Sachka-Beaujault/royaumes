/**
 * Entrée publique « partagée » du module Guilde : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des constantes,
 * des schémas de validation et des fonctions pures.
 */
export type { GuildId } from './domain/catalog'
export { CHANGE_COST, GUILD_INFO, GUILDS } from './domain/catalog'
export type { MemberError } from './domain/member'
export type { MemberView } from './domain/view'

/** Préfixe commun aux noms des flux de tous les membres. */
export const MEMBER_STREAM_PREFIX = 'guild-member-'

/** Nom du flux qui contient les événements de l'appartenance d'un joueur. */
export const memberStream = (playerId: string) => `${MEMBER_STREAM_PREFIX}${playerId}`

/** Sujets des messages adressés à la Guilde. */
export const GUILD_TOPICS = {
  /** Réponse du Village à un mouvement de ressources. */
  transferResult: 'guild.transfer-result',
} as const
