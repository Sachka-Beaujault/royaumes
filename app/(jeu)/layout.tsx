import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentGuild, currentUser } from '@/bootstrap/server'
import { AppShell } from '@/ui/app-shell'

// La mise en page dépend de la session : elle est rendue à chaque requête, jamais à l'avance.
export const dynamic = 'force-dynamic'

/**
 * Mise en page de l'espace de jeu, partagée par toutes les pages du groupe (jeu).
 * Elle vérifie sur le serveur, avant tout rendu, qu'un joueur est connecté,
 * et redirige vers la page de connexion dans le cas contraire. Elle transmet aussi au cadre
 * du jeu la guilde du joueur : sans guilde, seule la page de la Guilde est ouverte ; avec une
 * guilde, ses couleurs s'appliquent à tout le jeu.
 */
export default async function GameLayout({ children }: { children: ReactNode }) {
  const user = await currentUser(await headers())
  if (!user) redirect('/login')
  const guild = await currentGuild(user.id)
  return (
    <AppShell userName={user.name} guild={guild}>
      {children}
    </AppShell>
  )
}
