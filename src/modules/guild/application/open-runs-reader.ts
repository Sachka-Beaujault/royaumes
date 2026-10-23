import type { OpenRun } from '../contracts'
import type { GuildId } from '../domain/catalog'

/**
 * Port de lecture de la liste des expéditions ouvertes, défini par la couche application.
 * Il est distinct du port RunRepository : celui-ci sert les commandes (modèle d'écriture),
 * celui-là répond à une consultation (modèle de lecture).
 */
export interface OpenRunsReader {
  /** Expéditions d'une guilde, ouvertes un jour donné, qui peuvent encore être rejointes. */
  list(guild: GuildId, day: string): Promise<OpenRun[]>
  /** Identifiants des expéditions non terminées, ouvertes avant un jour donné. */
  unfinishedBefore(day: string): Promise<string[]>
}
