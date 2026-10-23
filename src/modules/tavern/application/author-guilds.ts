/**
 * Port de lecture de la guilde des auteurs de messages, défini par la couche application.
 * La Taverne ne connaît pas le module qui le met en œuvre : la racine de composition le lui
 * fournit, et la Taverne fonctionne sans lui, les auteurs n'ayant alors aucune guilde.
 */
export interface AuthorGuilds {
  /** Guilde actuelle de chacun des joueurs ; un joueur sans guilde est absent du résultat. */
  guildsOf(playerIds: string[]): Promise<Record<string, string>>
}
