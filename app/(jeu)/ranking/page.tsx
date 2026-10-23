import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { RankingScreen } from '@/modules/ranking/ui'

/** Titre de l'onglet, complété par le nom du jeu (app/layout.tsx). */
export const metadata: Metadata = { title: 'Classement' }

/** Page du Classement. Le joueur connecté y est mis en évidence. */
export default async function RankingPage() {
  const user = await currentUser(await headers())
  return <RankingScreen userId={user?.id ?? ''} />
}
