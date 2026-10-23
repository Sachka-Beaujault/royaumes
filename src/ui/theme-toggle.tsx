'use client'
import { useEffect, useState } from 'react'
import { Entity } from './entity'

/** Choix d'apparence du joueur : celui du système, le parchemin clair, ou la pierre sombre. */
type ThemeChoice = 'auto' | 'light' | 'dark'

/** Clé du choix dans le stockage local du navigateur, lue aussi par le script de app/layout.tsx. */
export const THEME_KEY = 'royaumes-theme'

/** Choix suivant, à chaque clic : système, clair, sombre, puis de nouveau système. */
const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' }

/** Libellé de chaque choix, lu par les lecteurs d'écran et affiché au survol. */
const LABELS: Record<ThemeChoice, string> = {
  auto: 'Apparence du système',
  light: 'Mode clair',
  dark: 'Mode sombre',
}

/** Lit le choix enregistré ; le stockage peut être indisponible, par exemple en navigation privée. */
function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

/**
 * Bouton de l'apparence : il pose l'attribut data-theme de la page, que lisent les variables
 * de couleur de globals.css, et retient le choix du joueur dans son navigateur.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('auto')

  useEffect(() => {
    setChoice(readChoice())
  }, [])

  function cycle() {
    const next = NEXT[choice]
    setChoice(next)
    if (next === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    try {
      if (next === 'auto') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      // Sans stockage, le choix vaut pour la page affichée.
    }
  }

  return (
    <button className="link theme-toggle" type="button" title={LABELS[choice]} onClick={cycle}>
      <Entity kind={`theme-${choice}`} decorative />
      <span className="sr-only">{LABELS[choice]}</span>
    </button>
  )
}
