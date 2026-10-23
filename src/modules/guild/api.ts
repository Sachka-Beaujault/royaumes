import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { ChatService } from './application/chat-service'
import type { GuildService } from './application/guild-service'
import {
  type ChatError,
  ChooseGuildInput,
  type MemberError,
  PostGuildMessageInput,
} from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<MemberError['code'], 409> = {
  ALREADY_MEMBER: 409,
  NOT_A_MEMBER: 409,
  SAME_GUILD: 409,
  CHANGE_PENDING: 409,
  GUILD_LOCKED: 409,
  ALREADY_ENTERED_TODAY: 409,
}

/** Code HTTP associé à chaque erreur du chat. */
const CHAT_STATUS: Record<ChatError['code'], 403 | 422 | 429> = {
  NOT_A_MEMBER: 403,
  EMPTY_MESSAGE: 422,
  MESSAGE_TOO_LONG: 422,
  TOO_MANY_MESSAGES: 429,
}

/**
 * Sous-application Hono du module Guilde, montée sur /api/guild.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createGuildApi(service: GuildService, chat: ChatService) {
  return (
    new Hono<AppEnv>()
      // Appartenance du joueur : sa guilde, et sa demande de changement en cours.
      .get('/', async (c) => c.json({ view: await service.getView(c.var.userId) }))

      // Premier choix d'une guilde, gratuit.
      .post('/join', validateJson(ChooseGuildInput), async (c) => {
        const result = await service.join(c.var.userId, c.req.valid('json').guild)
        return result.ok
          ? c.json({ view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Demande de changement de guilde, payée en or par le village du joueur.
      .post('/change', validateJson(ChooseGuildInput), async (c) => {
        const result = await service.requestChange(c.var.userId, c.req.valid('json').guild)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Derniers messages du chat de la guilde du joueur.
      .get('/chat', async (c) => {
        const result = await chat.latest(c.var.userId)
        return result.ok
          ? c.json({ guild: result.guild, messages: result.messages })
          : c.json({ error: result.error }, CHAT_STATUS[result.error.code])
      })

      // Publication d'un message dans le chat de la guilde du joueur.
      .post('/chat', validateJson(PostGuildMessageInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await chat.post(player, c.req.valid('json').body)
        if (result.ok) return c.json({ message: result.message }, 201)
        // En cas de limitation, l'en-tête Retry-After indique le délai à attendre, en secondes.
        if (result.error.code === 'TOO_MANY_MESSAGES') {
          c.header('Retry-After', String(Math.ceil(result.error.retryAfterMs / 1000)))
        }
        return c.json({ error: result.error }, CHAT_STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type GuildApi = ReturnType<typeof createGuildApi>
