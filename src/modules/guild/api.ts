import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { ChatService } from './application/chat-service'
import type { GuildService } from './application/guild-service'
import type { RiftError, RiftService } from './application/rift-service'
import {
  type ChatError,
  ChooseGuildInput,
  ChooseRoleInput,
  type MemberError,
  PostGuildMessageInput,
  SubmitRunActionInput,
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

/** Code HTTP associé à chaque erreur de la Faille. */
const RIFT_STATUS: Record<RiftError['code'], 403 | 404 | 409 | 422> = {
  NO_GUILD: 403,
  ALREADY_ENTERED_TODAY: 409,
  RUN_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  WRONG_PHASE: 409,
  RUN_FULL: 409,
  ALREADY_JOINED: 409,
  WRONG_GUILD: 403,
  NOT_A_MEMBER: 403,
  NOT_HOST: 403,
  HERO_DOWN: 409,
  ROUND_OVER: 409,
  ALREADY_CHOSEN: 409,
  INVALID_TARGET: 422,
}

/**
 * Sous-application Hono du module Guilde, montée sur /api/guild.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createGuildApi(service: GuildService, chat: ChatService, rift: RiftService) {
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

      // La Faille du jour et des jours suivants, et les expéditions ouvertes de la guilde.
      .get('/rift', async (c) => c.json(await rift.overview(c.var.userId)))

      // Ouverture d'une expédition, avec le rôle choisi : le joueur en devient l'hôte.
      .post('/rift/runs', validateJson(ChooseRoleInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const { runId, result } = await rift.open(player, c.req.valid('json').role)
        return result.ok
          ? c.json({ runId, view: result.view }, 201)
          : c.json({ error: result.error }, RIFT_STATUS[result.error.code])
      })

      // Vue d'une expédition, filtrée pour le joueur.
      .get('/rift/runs/:id', async (c) => {
        const view = await rift.getView(c.req.param('id'), c.var.userId)
        return view ? c.json({ view }) : c.json({ error: { code: 'RUN_NOT_FOUND' as const } }, 404)
      })

      .post('/rift/runs/:id/join', validateJson(ChooseRoleInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await rift.join(c.req.param('id'), player, c.req.valid('json').role)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, RIFT_STATUS[result.error.code])
      })

      .post('/rift/runs/:id/start', async (c) => {
        const result = await rift.execute(c.req.param('id'), c.var.userId, {
          type: 'StartRun',
          playerId: c.var.userId,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, RIFT_STATUS[result.error.code])
      })

      .post('/rift/runs/:id/action', validateJson(SubmitRunActionInput), async (c) => {
        const { round, action } = c.req.valid('json')
        const result = await rift.execute(c.req.param('id'), c.var.userId, {
          type: 'SubmitAction',
          playerId: c.var.userId,
          round,
          action,
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, RIFT_STATUS[result.error.code])
      })

      // Commande d'échéance, envoyée par l'interface lorsque son compte à rebours atteint zéro.
      .post('/rift/runs/:id/deadline', async (c) => {
        const result = await rift.execute(c.req.param('id'), c.var.userId, {
          type: 'CheckDeadline',
        })
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, RIFT_STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type GuildApi = ReturnType<typeof createGuildApi>
