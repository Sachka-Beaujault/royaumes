/**
 * Contenu de la Guilde : les guildes du royaume et les valeurs d'équilibrage.
 * Ce fichier ne contient que des données. Les règles qui les utilisent
 * se trouvent dans member.ts : rééquilibrer le jeu ne demande de modifier qu'ici.
 */

/** Guildes du royaume, fixes. « as const » permet d'en déduire un type union. */
export const GUILDS = ['red', 'green', 'blue'] as const
export type GuildId = (typeof GUILDS)[number]

/** Nom, couleur, devise et portrait de chaque guilde, tels que les présente l'interface. */
export const GUILD_INFO: Record<
  GuildId,
  { name: string; color: string; motto: string; portrait: string }
> = {
  red: {
    name: 'Ordre du Dragon',
    color: 'rouge',
    motto: 'Le feu ne s’éteint jamais',
    portrait: 'Héritiers des forges et des volcans, ils frappent les premiers et ne reculent pas.',
  },
  green: {
    name: 'Cercle du Chêne',
    color: 'vert',
    motto: 'Nos racines tiennent la terre',
    portrait: 'Gardiens des forêts anciennes, ils endurent les tempêtes et protègent les leurs.',
  },
  blue: {
    name: "Garde de l'Onde",
    color: 'bleu',
    motto: 'Ce qui coule ne se brise pas',
    portrait: 'Marins et veilleurs des côtes, ils contournent l’obstacle et reviennent toujours.',
  },
}

/** Prix d'un changement de guilde, prélevé dans le village du joueur. */
export const CHANGE_COST = { gold: 50 }
