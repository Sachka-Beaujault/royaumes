import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { RiftRun } from '@/modules/guild/ui'

/** Titre de l'onglet, complété par le nom du jeu (app/layout.tsx). */
export const metadata: Metadata = { title: 'La Faille' }

/**
 * Page d'une expédition de la Faille. Son adresse contient l'identifiant de l'expédition :
 * il suffit de la communiquer aux membres de la guilde pour qu'ils la rejoignent.
 */
export default async function RiftRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser(await headers())
  return <RiftRun runId={id} userId={user?.id ?? ''} />
}
