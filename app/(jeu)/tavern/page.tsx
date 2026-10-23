import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { TavernScreen } from '@/modules/tavern/ui'

/** Titre de l'onglet, complété par le nom du jeu (app/layout.tsx). */
export const metadata: Metadata = { title: 'Taverne' }

/** Page de la Taverne. Les messages du joueur connecté y sont mis en évidence. */
export default async function TavernPage() {
  const user = await currentUser(await headers())
  return <TavernScreen userId={user?.id ?? ''} />
}
