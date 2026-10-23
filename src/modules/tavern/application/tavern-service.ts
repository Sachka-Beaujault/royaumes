import type { PresentPlayer, TavernMessage } from '../contracts'
import {
  checkBody,
  checkRate,
  expiredBefore,
  type MessageError,
  RATE_LIMIT,
} from '../domain/message'
import { staleBefore } from '../domain/presence'
import type { AuthorGuilds } from './author-guilds'
import type { MessageRepository, StoredTavernMessage } from './message-repository'
import type { PresenceRepository } from './presence-repository'

/** Nombre de messages présentés à l'ouverture de la Taverne. */
export const HISTORY_SIZE = 50

export type PostResult = { ok: true; message: TavernMessage } | { ok: false; error: MessageError }

/** Service applicatif de la Taverne. */
export function createTavernService(
  repo: MessageRepository,
  presence: PresenceRepository,
  clock = () => Date.now(),
  authorGuilds?: AuthorGuilds,
) {
  /**
   * Ajoute à des messages la guilde actuelle de leurs auteurs, lue une fois par auteur.
   * Sans lecteur des guildes, aucun auteur n'a de guilde.
   */
  async function withGuilds(messages: StoredTavernMessage[]): Promise<TavernMessage[]> {
    const authors = [...new Set(messages.map((message) => message.authorId))]
    const guilds = authorGuilds && authors.length > 0 ? await authorGuilds.guildsOf(authors) : {}
    return messages.map((message) => ({
      ...message,
      authorGuild: guilds[message.authorId] ?? null,
    }))
  }

  /** Publie un message au nom d'un joueur, après validation et limitation. */
  async function post(player: { id: string; name: string }, body: string): Promise<PostResult> {
    const checked = checkBody(body)
    if (!checked.ok) return checked
    const now = clock()
    const recent = await repo.postedSince(player.id, now - RATE_LIMIT.windowMs)
    const limited = checkRate(recent, now)
    if (limited) return { ok: false, error: limited }
    const stored = await repo.add({
      authorId: player.id,
      authorName: player.name,
      body: checked.body,
      postedAt: now,
    })
    const [message] = await withGuilds([stored])
    return { ok: true, message }
  }

  /**
   * Derniers messages de la Taverne. Les messages qui ont dépassé leur durée de conservation
   * sont d'abord supprimés : ils ne sont jamais présentés, même si la tâche quotidienne
   * ne les a pas encore supprimés.
   */
  async function latest() {
    await repo.removeOlderThan(expiredBefore(clock()))
    return withGuilds(await repo.latest(HISTORY_SIZE))
  }

  /**
   * Tâche quotidienne : applique les durées de conservation des messages et de la présence,
   * même si personne ne visite la Taverne. Renvoie le nombre de lignes supprimées.
   */
  async function purge() {
    const now = clock()
    return {
      messages: await repo.removeOlderThan(expiredBefore(now)),
      presence: await presence.removeStale(staleBefore(now)),
    }
  }

  /**
   * Joueurs présents. Les lignes des joueurs partis sont d'abord supprimées : la présence
   * n'est conservée que le temps de la visite, sans tâche de fond pour faire le ménage.
   */
  async function present(): Promise<PresentPlayer[]> {
    await presence.removeStale(staleBefore(clock()))
    return presence.list()
  }

  /** Enregistre le signal de présence d'un joueur, et renvoie les joueurs présents. */
  async function heartbeat(player: PresentPlayer) {
    await presence.touch(player, clock())
    return present()
  }

  /** Retire aussitôt un joueur qui quitte la Taverne. */
  const leave = (playerId: string) => presence.remove(playerId)

  return { post, latest, present, heartbeat, leave, purge, withGuilds }
}

export type TavernService = ReturnType<typeof createTavernService>
