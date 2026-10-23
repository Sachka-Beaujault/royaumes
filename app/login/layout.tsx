import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/** Titre de l'onglet de la page de connexion, qui est un composant client. */
export const metadata: Metadata = { title: 'Connexion' }

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
