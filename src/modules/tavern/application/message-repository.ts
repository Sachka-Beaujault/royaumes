import type { TavernMessage } from '../contracts'

/** Message enregistré, tel que le conserve le stockage : sans la guilde de son auteur. */
export type StoredTavernMessage = Omit<TavernMessage, 'authorGuild'>

/** Message à enregistrer : son identifiant est attribué par le stockage. */
export type NewTavernMessage = Omit<StoredTavernMessage, 'id'>

/**
 * Port de persistance des messages, défini par la couche application.
 * Il n'est pas fondé sur des événements : les messages sont insérés, lus, puis supprimés.
 */
export interface MessageRepository {
  /** Enregistre un message et le renvoie, avec son identifiant. */
  add(message: NewTavernMessage): Promise<StoredTavernMessage>
  /** Derniers messages, du plus ancien au plus récent. */
  latest(limit: number): Promise<StoredTavernMessage[]>
  /** Messages postérieurs à un identifiant, du plus ancien au plus récent. */
  after(id: number, limit: number): Promise<StoredTavernMessage[]>
  /** Identifiant du dernier message ; 0 s'il n'y en a aucun. */
  lastId(): Promise<number>
  /** Dates des messages d'un auteur publiés depuis l'instant since. */
  postedSince(authorId: string, since: number): Promise<number[]>
  /** Supprime les messages publiés avant l'instant before ; renvoie leur nombre. */
  removeOlderThan(before: number): Promise<number>
}
