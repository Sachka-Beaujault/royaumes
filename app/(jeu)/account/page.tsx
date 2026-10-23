import type { Metadata } from 'next'
import { AccountScreen } from '@/ui/account-screen'

/** Titre de l'onglet, complété par le nom du jeu (app/layout.tsx). */
export const metadata: Metadata = { title: 'Mes données' }

/** Page « Mes données ». L'accès est réservé aux joueurs connectés par la mise en page du jeu. */
export default function AccountPage() {
  return <AccountScreen />
}
