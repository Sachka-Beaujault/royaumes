'use client'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Réglage commun des animations : elles sont réduites à de simples fondus pour les joueurs
 * dont le système demande de réduire les animations, comme le sont les transitions CSS.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
