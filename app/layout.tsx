import type { Metadata } from 'next'
import type { ReactNode } from 'react'
/*
 * Polices du jeu, servies par l'application elle-même, sans requête vers un service tiers :
 * Cinzel, capitales gravées des inscriptions, pour les titres ; EB Garamond, serif ancien,
 * pour le texte. Elles sont déclarées dans globals.css (--font-display, --font-body).
 */
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/600.css'
import './globals.css'

// Métadonnées par défaut de toutes les pages : titre de l'onglet et description.
export const metadata: Metadata = {
  title: 'Royaumes',
  description: 'Jeu multijoueur médiéval : villages, guildes, donjons et la Faille',
}

/**
 * Mise en page racine, partagée par toutes les pages de l'application.
 * Le type des propriétés est déclaré explicitement plutôt qu'au moyen du type
 * global LayoutProps généré par Next.js : ce dernier n'existe qu'après une
 * première construction, ce qui ferait échouer la vérification des types
 * sur un dépôt fraîchement cloné.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
