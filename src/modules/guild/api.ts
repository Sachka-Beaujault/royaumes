import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { GuildService } from './application/guild-service'
import { ChooseGuildInput, type MemberError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<MemberError['code'], 409> = {
  ALREADY_MEMBER: 409,
  NOT_A_MEMBER: 409,
  SAME_GUILD: 409,
  CHANGE_PENDING: 409,
}

/**
 * Sous-application Hono du module Guilde, montée sur /api/guild.
 * Le joueur est toujours celui que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createGuildApi(service: GuildService) {
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
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type GuildApi = ReturnType<typeof createGuildApi>
