/**
 * Entrée publique « serveur » du module Guilde.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createGuildApi } from './api'
import { createChatService } from './application/chat-service'
import { createGuildService } from './application/guild-service'
import { GUILD_MESSAGE_POSTED, GUILDS, guildChatChannel } from './contracts'
import { createDrizzleChatRepository } from './infrastructure/drizzle-chat-repository'
import { createEventStoreMemberRepository } from './infrastructure/event-store-member-repository'
import { createGuildHandlers } from './messages'
import { createGuildPersonalData } from './personal-data'

export interface GuildModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Base de données, dans laquelle la Guilde tient les messages de ses chats. */
  db: Db
  /** Distribution de la boîte d'envoi, déclenchée par la Guilde après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Nombre maximal de messages transmis à la fois par un canal de chat. */
const CHANNEL_BATCH = 100

/**
 * Fabrique du module : assemble les adaptateurs, les services, l'API, les règles des canaux et
 * les gestionnaires de messages.
 */
export function createGuildModule({ store, db, dispatch, clock }: GuildModuleDeps) {
  const members = createEventStoreMemberRepository(store)
  const service = createGuildService(members, { dispatch, clock })
  const chatRepo = createDrizzleChatRepository(db)
  const chat = createChatService(chatRepo, members, clock)

  // Un canal par chat de guilde, réservé à ses membres : l'appartenance est relue dans le
  // journal à chaque abonnement. Comme celui de la Taverne, il ne lit pas le journal, mais la
  // table des messages, filtrée sur la guilde du canal ; chaque message y est présenté comme un
  // événement, dont la position est l'identifiant du message. Le canal n'est pas discret : les
  // messages sont destinés à tous les membres, et l'interface les affiche sans relire l'API.
  // DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-014) : l'appartenance n'est vérifiée
  // qu'à l'abonnement ; un joueur qui quitte la guilde reçoit encore ses messages jusqu'à la
  // fermeture de son flux, au plus 240 secondes plus tard.
  const channelPolicies: ChannelPolicy[] = GUILDS.map((guild) => ({
    prefix: guildChatChannel(guild),
    canSubscribe: async (channel, userId) =>
      channel === guildChatChannel(guild) && (await chat.guildOf(userId)) === guild,
    source: {
      async read(after) {
        const fresh = await chatRepo.after(guild, after, CHANNEL_BATCH)
        return fresh.map((message) => ({
          position: message.id,
          stream: guildChatChannel(guild),
          version: message.id,
          type: GUILD_MESSAGE_POSTED,
          data: { ...message },
          occurredAt: new Date(message.postedAt),
        }))
      },
      // Un nouvel abonné ne reçoit que les messages à venir ; l'historique est lu par l'API.
      start: () => chatRepo.lastId(),
    },
  }))

  // La tâche quotidienne est confiée à la racine de composition, qui la fait exécuter
  // par la tâche planifiée de Vercel.
  return {
    api: createGuildApi(service, chat),
    channelPolicies,
    dailyTask: chat.purge,
    handlers: createGuildHandlers(service),
    personalData: createGuildPersonalData(store, db),
  }
}

/**
 * Lecture de la guilde d'un joueur, pour les pages rendues sur le serveur : la mise en page du
 * jeu y vérifie qu'un joueur a choisi sa guilde avant de lui présenter les autres pages.
 */
export function createGuildReader(store: EventStore) {
  const repo = createEventStoreMemberRepository(store)
  return {
    async guildOf(playerId: string) {
      const { state } = await repo.load(playerId)
      return state.guild
    },
  }
}

export type { GuildApi } from './api'
