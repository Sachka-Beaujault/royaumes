import type { GuildRanking } from '../contracts'

/** Port de lecture du classement des guildes, défini par la couche application. */
export interface GuildRankingReader {
  /** Classement des guildes pour un jour donné, et meilleurs scores de tous les temps. */
  standings(day: string): Promise<GuildRanking>
}
