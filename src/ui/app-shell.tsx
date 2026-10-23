'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'
import { authClient } from '@/platform/auth/client'
import { Entity } from './entity'

/** Liens de navigation : chaque module ajouté au jeu y reçoit une entrée. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/ranking', kind: 'ranking', label: 'Classement' },
  { href: '/market', kind: 'market', label: 'Marché' },
  { href: '/tavern', kind: 'tavern', label: 'Taverne' },
  { href: '/guild', kind: 'guild', label: 'Guilde' },
]

/** Page du choix de la guilde, seule page ouverte à un joueur qui n'en a pas encore. */
const GUILD_PAGE = '/guild'

/**
 * Cadre de l'espace de jeu : navigation, nom du joueur, accès à ses données et déconnexion.
 * Un joueur sans guilde est conduit à la page de la Guilde ; les autres pages ne sont pas
 * affichées tant qu'il n'en a pas choisi une.
 */
export function AppShell({
  userName,
  hasGuild,
  children,
}: {
  userName: string
  hasGuild: boolean
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const allowed = hasGuild || pathname.startsWith(GUILD_PAGE) || pathname === '/account'

  useEffect(() => {
    if (!allowed) router.replace(GUILD_PAGE)
  }, [allowed, router])

  async function signOut() {
    // La session est supprimée côté serveur, puis la page est entièrement rechargée,
    // afin qu'aucun état de la session précédente ne subsiste dans le navigateur.
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          >
            <Entity kind={item.kind} /> {item.label}
          </Link>
        ))}
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {userName}
        </span>
        <Link href="/account" aria-current={pathname === '/account' ? 'page' : undefined}>
          Mes données
        </Link>
        <button className="link" type="button" onClick={signOut}>
          Déconnexion
        </button>
      </nav>
      {allowed && children}
    </>
  )
}
