/**
 * Couche de thème : l'apparence de chaque entité du jeu est définie ici, et nulle part ailleurs.
 * Les composants n'affichent jamais un symbole en dur : ils demandent l'apparence
 * d'une entité par son identifiant. Changer de direction artistique, par exemple
 * remplacer les symboles par des images, ne demande de modifier que ce fichier.
 *
 * Les symboles sont des icônes du jeu game-icons.net, distribué par react-icons : un même
 * trait gravé, dans l'esprit des blasons et des enluminures.
 */
import type { IconType } from 'react-icons'
import {
  GiBeerStein,
  GiBlackKnightHelm,
  GiBroadsword,
  GiCastle,
  GiCheckedShield,
  GiCircularSaw,
  GiDragonHead,
  GiDungeonGate,
  GiFlyingFlag,
  GiGoblinHead,
  GiGolemHead,
  GiHealing,
  GiHoodedFigure,
  GiLaurelsTrophy,
  GiMineWagon,
  GiMoon,
  GiOak,
  GiPortal,
  GiQuillInk,
  GiScales,
  GiShamblingZombie,
  GiSkeleton,
  GiSpectre,
  GiStoneBlock,
  GiStonePile,
  GiSun,
  GiTroll,
  GiTwoCoins,
  GiVisoredHelm,
  GiWaveCrest,
  GiWaxSeal,
  GiWoodenDoor,
  GiWoodPile,
  GiYinYang,
} from 'react-icons/gi'

export interface Look {
  /** Icône affichée. */
  icon: IconType
  /** Libellé en français, lu par les lecteurs d'écran et affiché au survol. */
  label: string
}

export const theme: Record<string, Look> = {
  village: { icon: GiCastle, label: 'Village' },
  wood: { icon: GiWoodPile, label: 'Bois' },
  stone: { icon: GiStoneBlock, label: 'Pierre' },
  gold: { icon: GiTwoCoins, label: 'Or' },
  sawmill: { icon: GiCircularSaw, label: 'Scierie' },
  quarry: { icon: GiStonePile, label: 'Carrière' },
  mine: { icon: GiMineWagon, label: 'Mine' },
  dungeon: { icon: GiDungeonGate, label: 'Donjon' },
  hero: { icon: GiVisoredHelm, label: 'Héros' },
  companion: { icon: GiHoodedFigure, label: 'Compagnon' },
  goblin: { icon: GiGoblinHead, label: 'Gobelin' },
  skeleton: { icon: GiSkeleton, label: 'Squelette' },
  troll: { icon: GiTroll, label: 'Troll' },
  door: { icon: GiWoodenDoor, label: 'Porte' },
  ranking: { icon: GiLaurelsTrophy, label: 'Classement' },
  market: { icon: GiScales, label: 'Marché' },
  tavern: { icon: GiBeerStein, label: 'Taverne' },
  guild: { icon: GiFlyingFlag, label: 'Guilde' },
  'guild-red': { icon: GiDragonHead, label: 'Ordre du Dragon' },
  'guild-green': { icon: GiOak, label: 'Cercle du Chêne' },
  'guild-blue': { icon: GiWaveCrest, label: "Garde de l'Onde" },
  rift: { icon: GiPortal, label: 'La Faille' },
  tank: { icon: GiCheckedShield, label: 'Tank' },
  healer: { icon: GiHealing, label: 'Soigneur' },
  attacker: { icon: GiBroadsword, label: 'Attaquant' },
  shade: { icon: GiSpectre, label: 'Ombre' },
  ghoul: { icon: GiShamblingZombie, label: 'Goule' },
  golem: { icon: GiGolemHead, label: 'Golem' },
  warden: { icon: GiBlackKnightHelm, label: 'Gardien de la Faille' },
  seal: { icon: GiWaxSeal, label: 'Sceau' },
  quill: { icon: GiQuillInk, label: 'Plume' },
  'theme-auto': { icon: GiYinYang, label: 'Apparence du système' },
  'theme-light': { icon: GiSun, label: 'Mode clair' },
  'theme-dark': { icon: GiMoon, label: 'Mode sombre' },
}

/** Apparence d'une entité ; une apparence neutre si l'entité n'est pas décrite. */
export const look = (kind: string): Look => theme[kind] ?? { icon: GiFlyingFlag, label: kind }
