/**
 * Contenu de la Faille : rôles des héros, monstres et valeurs d'équilibrage.
 * Ce fichier ne contient que des données. Les règles qui les utilisent se trouvent
 * dans rift-rules.ts : rééquilibrer la Faille ne demande de modifier qu'ici.
 */

/** Rôles des héros. « as const » permet d'en déduire un type union. */
export const ROLES = ['tank', 'healer', 'attacker'] as const
export type Role = (typeof ROLES)[number]

/**
 * Caractéristiques de départ de chaque rôle (règle 12) : le tank a le plus de points de vie,
 * l'attaquant la meilleure attaque, le soigneur un équilibre entre les deux.
 */
export const ROLE_STATS: Record<Role, { hp: number; attack: number }> = {
  tank: { hp: 40, attack: 5 },
  healer: { hp: 28, attack: 4 },
  attacker: { hp: 26, attack: 9 },
}

/** Points de vie rendus par un soin : le soigneur soigne deux fois mieux que les autres rôles. */
export const HEAL_AMOUNT: Record<Role, number> = { tank: 6, healer: 12, attacker: 6 }

/** Part des dégâts subis par un tank, arrondie à l'unité supérieure. */
export const TANK_DAMAGE_FACTOR = 0.7

/** Points de vie rendus à chaque héros debout lorsqu'il atteint l'étage suivant. */
export const REST_HEAL = 5

/** Nombre maximal de héros dans une expédition. */
export const MAX_HEROES = 4

/** Durée maximale d'une manche de combat, en millisecondes. */
export const ROUND_MS = 30_000

/** Écart maximal, en plus ou en moins, entre les dégâts infligés et l'attaque. */
export const DAMAGE_SPREAD = { hero: 2, monster: 1 }

/** Monstres de la Faille. « as const » permet d'en déduire un type union. */
export const RIFT_MONSTERS = {
  shade: { name: 'Ombre', hp: 10, attack: 3 },
  ghoul: { name: 'Goule', hp: 14, attack: 4 },
  golem: { name: 'Golem', hp: 20, attack: 3 },
  warden: { name: 'Gardien de la Faille', hp: 30, attack: 6 },
} as const

export type RiftMonsterKind = keyof typeof RIFT_MONSTERS

/** Monstres qui peuplent les étages ordinaires. */
export const COMMON_MONSTERS: RiftMonsterKind[] = ['shade', 'ghoul', 'golem']

/** Monstre qui garde un étage sur cinq. */
export const BOSS: RiftMonsterKind = 'warden'

/** Un boss garde chaque étage dont le numéro est un multiple de cette valeur (règle 14). */
export const BOSS_EVERY = 5

/** Nombre maximal de monstres d'un étage ordinaire. */
export const MAX_MONSTERS = 3

/**
 * Renforcement des monstres d'un étage à l'autre (règle 14) : leurs points de vie augmentent
 * de 15 % par étage, leur attaque d'un point tous les deux étages.
 */
export const FLOOR_GROWTH = { hp: 0.15, attack: 0.5 }

/** Renforcement supplémentaire du boss à chacune de ses apparitions : 25 % de points de vie. */
export const BOSS_GROWTH = 0.25
