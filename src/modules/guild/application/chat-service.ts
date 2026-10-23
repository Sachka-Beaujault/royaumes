import type { GuildMessage } from '../contracts'
import type { GuildId } from '../domain/catalog'
import { type ChatError, checkBody, checkRate, expiredBefore, RATE_LIMIT } from '../domain/chat'
import type { ChatRepository } from './chat-repository'
import type { MemberRepository } from './member-repository'

/** Nombre de messages présentés à l'ouverture du chat. */
export const HISTORY_SIZE = 50

export type PostResult = { ok: true; message: GuildMessage } | { ok: false; error: ChatError }

export type HistoryResult =
  | { ok: true; guild: GuildId; messages: GuildMessage[] }
  | { ok: false; error: ChatError }

/**
 * Service applicatif du chat de guilde. Un joueur n'accède qu'au chat de sa guilde actuelle,
 * lue dans le journal au moment de chaque requête : après un changement de guilde, il quitte
 * l'ancien chat et rejoint le nouveau.
 */
export function createChatService(
  repo: ChatRepository,
  members: MemberRepository,
  clock = () => Date.now(),
) {
  /** Guilde actuelle d'un joueur ; null s'il n'en a choisi aucune. */
  async function guildOf(playerId: string) {
    const { state } = await members.load(playerId)
    return state.guild
  }

  /** Publie un message dans le chat de la guilde du joueur, après validation et limitation. */
  async function post(player: { id: string; name: string }, body: string): Promise<PostResult> {
    const guild = await guildOf(player.id)
    if (!guild) return { ok: false, error: { code: 'NOT_A_MEMBER' } }
    const checked = checkBody(body)
    if (!checked.ok) return checked
    const now = clock()
    const recent = await repo.postedSince(player.id, now - RATE_LIMIT.windowMs)
    const limited = checkRate(recent, now)
    if (limited) return { ok: false, error: limited }
    const message = await repo.add({
      guild,
      authorId: player.id,
      authorName: player.name,
      body: checked.body,
      postedAt: now,
    })
    return { ok: true, message }
  }

  /**
   * Derniers messages du chat de la guilde du joueur. Les messages qui ont dépassé leur durée
   * de conservation sont d'abord supprimés : ils ne sont jamais présentés.
   */
  async function latest(playerId: string): Promise<HistoryResult> {
    const guild = await guildOf(playerId)
    if (!guild) return { ok: false, error: { code: 'NOT_A_MEMBER' } }
    await repo.removeOlderThan(expiredBefore(clock()))
    return { ok: true, guild, messages: await repo.latest(guild, HISTORY_SIZE) }
  }

  /**
   * Tâche quotidienne : applique la durée de conservation des messages, même si personne ne
   * consulte les chats. Renvoie le nombre de messages supprimés.
   */
  async function purge() {
    return { messages: await repo.removeOlderThan(expiredBefore(clock())) }
  }

  return { post, latest, purge, guildOf }
}

export type ChatService = ReturnType<typeof createChatService>
