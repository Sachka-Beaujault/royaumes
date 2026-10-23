'use client'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Entity } from './entity'

/**
 * Combattant du Donjon ou de la Faille : son portrait, son nom et sa jauge de points de vie.
 * La carte tremble lorsque le combattant perd des points de vie, et la jauge suit ses points
 * de vie. Elle est partagée par les modules qui mettent en scène un combat.
 */
export function Fighter({
  kind,
  name,
  detail,
  hp,
  maxHp,
  mine = false,
  foe = false,
  badge = null,
}: {
  kind: string
  name: string
  detail: string
  hp: number
  maxHp: number
  mine?: boolean
  foe?: boolean
  badge?: string | null
}) {
  // Points de vie lors de l'affichage précédent : une baisse déclenche le tremblement.
  const previous = useRef(hp)
  const hit = hp < previous.current
  useEffect(() => {
    previous.current = hp
  }, [hp])

  return (
    <motion.div
      className="fighter-card"
      data-foe={foe}
      data-mine={mine || undefined}
      data-down={hp <= 0}
      animate={hit ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="fighter-portrait">
        <Entity kind={kind} />
      </div>
      <div className="fighter-body">
        <div className="fighter-head">
          <strong>{name}</strong>
          {badge && <span className="ok">{badge}</span>}
        </div>
        <span className="muted">{detail}</span>
        <div className="hp" role="img" aria-label={`${hp} points de vie sur ${maxHp}`}>
          <motion.span
            initial={false}
            animate={{ width: `${(100 * hp) / maxHp}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          <em>
            {hp}/{maxHp}
          </em>
        </div>
      </div>
    </motion.div>
  )
}
