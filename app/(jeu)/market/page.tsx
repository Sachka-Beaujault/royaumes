import type { Metadata } from 'next'
import { MarketScreen } from '@/modules/market/ui'

/** Titre de l'onglet, complété par le nom du jeu (app/layout.tsx). */
export const metadata: Metadata = { title: 'Marché' }

/** Page du Marché. L'accès est déjà réservé aux joueurs connectés par la mise en page du jeu. */
export default function MarketPage() {
  return <MarketScreen />
}
