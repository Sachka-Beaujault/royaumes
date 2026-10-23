import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
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
import { MotionProvider } from '@/ui/motion-provider'

// Couleur de la barre du navigateur sur téléphone : la pierre sombre du fond du jeu.
export const viewport: Viewport = { themeColor: '#0d0b09' }

// Métadonnées par défaut de toutes les pages : titre de l'onglet et description. Chaque page
// fournit son propre titre, complété par le nom du jeu.
export const metadata: Metadata = {
  title: { default: 'Royaumes', template: '%s · Royaumes' },
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
    // L'attribut data-theme est posé par le script ci-dessous avant l'hydratation : il diffère
    // du rendu du serveur, ce que React est prié de ne pas signaler.
    <html lang="fr" suppressHydrationWarning>
      <body>
        {/* Apparence choisie par le joueur, appliquée avant le premier affichage, sans éclair. */}
        <Script id="theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('royaumes-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
        <MotionProvider>
          <main>{children}</main>
        </MotionProvider>
      </body>
    </html>
  )
}
