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
  guild,
  children,
}: {
  userName: string
  /** Guilde du joueur (« red », « green », « blue ») ; null s'il n'en a choisi aucune. */
  guild: string | null
  children: ReactNode
}) {
  const hasGuild = guild !== null
  const pathname = usePathname()
  const router = useRouter()
  // DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-018) : le choix de la guilde n'est
  // imposé que par l'interface ; les routes de l'API des autres modules restent accessibles à
  // un joueur qui n'en a pas choisi.
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

  // Les couleurs de la guilde du joueur s'appliquent à tout le cadre du jeu, par l'attribut
  // data-guild, que lisent les variables de couleur de globals.css. Il est aussi posé sur la
  // page entière, afin que son fond prenne la couleur de la guilde.
  useEffect(() => {
    if (guild) document.documentElement.dataset.guild = guild
    else delete document.documentElement.dataset.guild
  }, [guild])

  return (
    <div data-guild={guild ?? undefined}>
      <nav className="nav" aria-label="Navigation principale">
        {/* Tant qu'aucune guilde n'est choisie, seul le choix de la guilde est proposé. */}
        {(hasGuild ? NAV : []).map((item) => (
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
    </div>
  )
}
