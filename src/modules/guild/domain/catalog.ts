/**
 * Contenu de la Guilde : les guildes du royaume et les valeurs d'équilibrage.
 * Ce fichier ne contient que des données. Les règles qui les utilisent
 * se trouvent dans member.ts : rééquilibrer le jeu ne demande de modifier qu'ici.
 */

/** Guildes du royaume, fixes. « as const » permet d'en déduire un type union. */
export const GUILDS = ['red', 'green', 'blue'] as const
export type GuildId = (typeof GUILDS)[number]

/** Nom et couleur de chaque guilde, tels que les présente l'interface. */
export const GUILD_INFO: Record<GuildId, { name: string; color: string }> = {
  red: { name: 'Ordre du Dragon', color: 'rouge' },
  green: { name: 'Cercle du Chêne', color: 'vert' },
  blue: { name: "Garde de l'Onde", color: 'bleu' },
}

/** Prix d'un changement de guilde, prélevé dans le village du joueur. */
export const CHANGE_COST = { gold: 50 }
