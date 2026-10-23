import type { Metadata } from 'next'
import { DungeonLobby } from '@/modules/dungeon/ui'

/** Titre de l'onglet, complété par le nom du jeu (app/layout.tsx). */
export const metadata: Metadata = { title: 'Donjon' }

/** Page du Donjon : liste des expéditions ouvertes et ouverture d'une expédition. */
export default function DungeonPage() {
  return <DungeonLobby />
}
