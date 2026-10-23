import type { GuildMessage } from '../contracts'
import type { GuildId } from '../domain/catalog'

/** Message à enregistrer : son identifiant est attribué par le stockage. */
export type NewGuildMessage = Omit<GuildMessage, 'id'> & { guild: GuildId }

/**
 * Port de persistance des messages du chat, défini par la couche application.
 * Il n'est pas fondé sur des événements : les messages sont insérés, lus, puis supprimés.
 */
export interface ChatRepository {
  /** Enregistre un message et le renvoie, avec son identifiant. */
  add(message: NewGuildMessage): Promise<GuildMessage>
  /** Derniers messages du chat d'une guilde, du plus ancien au plus récent. */
  latest(guild: GuildId, limit: number): Promise<GuildMessage[]>
  /** Messages du chat d'une guilde postérieurs à un identifiant, du plus ancien au plus récent. */
  after(guild: GuildId, id: number, limit: number): Promise<GuildMessage[]>
  /** Identifiant du dernier message, toutes guildes confondues ; 0 s'il n'y en a aucun. */
  lastId(): Promise<number>
  /** Dates des messages d'un auteur publiés depuis l'instant since. */
  postedSince(authorId: string, since: number): Promise<number[]>
  /** Supprime les messages publiés avant l'instant before ; renvoie leur nombre. */
  removeOlderThan(before: number): Promise<number>
}
