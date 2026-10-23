'use client'
import { hc } from 'hono/client'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import { RANKING_CHANNEL, type Ranking } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RankingApi>('/api/ranking')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Délai entre deux relectures, tant que la projection n'a pas atteint l'événement annoncé. */
const RETRY_MS = 1_000

/** Nombre maximal de relectures pour un même événement annoncé. */
const MAX_READS = 10

/** Écran du Classement : les meilleurs joueurs, le joueur connecté étant mis en évidence. */
export function RankingScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours.
  const [ranking, setRanking] = useState<Ranking | undefined>(undefined)

  // REQUÊTE : la lecture déclenche, côté serveur, le rattrapage de la projection.
  // Renvoie la position jusqu'à laquelle le classement reçu est à jour ; 0 en cas d'échec.
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setRanking(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Position du dernier événement annoncé, et indicateur d'une relecture en cours.
  const wanted = useRef(0)
  const following = useRef(false)

  // TEMPS RÉEL : le canal annonce un événement qui modifie le classement. Le classement est
  // relu jusqu'à ce que la projection ait atteint la position de cet événement : elle peut
  // s'être arrêtée, quelques secondes, devant une position manquante.
  const follow = useCallback(
    async (event: ChannelEvent) => {
      wanted.current = Math.max(wanted.current, event.position)
      // Une relecture est déjà en cours : elle tiendra compte de la nouvelle position.
      if (following.current) return
      following.current = true
      try {
        for (let read = 0; read < MAX_READS; read++) {
          if ((await refresh()) >= wanted.current) return
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        }
      } finally {
        following.current = false
      }
    },
    [refresh],
  )

  const status = useChannel(RANKING_CHANNEL, follow)
  const entries = ranking?.entries

  const podium = entries?.slice(0, 3) ?? []

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-kicker">Les grands noms du royaume</p>
          <h1>
            <Entity kind="ranking" decorative /> Classement
          </h1>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </header>

      {entries?.length === 0 && <p className="muted">Aucun joueur classé pour le moment.</p>}

      {/* Podium des trois premiers : le premier au centre, plus haut que les deux autres. */}
      {podium.length > 0 && (
        <section className="podium" aria-label="Podium">
          {podium.map((entry, index) => (
            <motion.div
              key={entry.playerId}
              className="podium-step"
              data-rank={entry.rank}
              data-mine={entry.playerId === userId || undefined}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.12, duration: 0.5 }}
            >
              <span className="podium-rank">{entry.rank}</span>
              <strong>{entry.label}</strong>
              <span className="muted">
                {entry.gamesWon} victoire{entry.gamesWon > 1 ? 's' : ''} · <Entity kind="gold" />{' '}
                {entry.gold}
              </span>
            </motion.div>
          ))}
        </section>
      )}

      {entries && entries.length > 0 && (
        <section className="panel" aria-label="Classement des joueurs">
          <table className="ranking">
            <thead>
              <tr>
                <th aria-label="Rang">#</th>
                <th>Joueur</th>
                <th>Victoires</th>
                <th>Expéditions</th>
                <th>
                  <Entity kind="gold" />
                </th>
                <th>Meilleur butin</th>
                <th>Améliorations</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerId}
                  aria-current={entry.playerId === userId ? 'true' : undefined}
                >
                  <td>{entry.rank}</td>
                  <td>{entry.label}</td>
                  <td>{entry.gamesWon}</td>
                  <td>{entry.gamesPlayed}</td>
                  <td>{entry.gold}</td>
                  <td>{entry.bestLoot}</td>
                  <td>{entry.upgrades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
