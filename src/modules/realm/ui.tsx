'use client'
import { hc } from 'hono/client'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  CATALOG,
  type DomainError,
  MAX_LEVEL,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RealmApi>('/api/realm')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/** Indique si le stock couvre un coût ; faux si le coût est absent (niveau maximal). */
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

/** Niveaux d'un bâtiment, de 1 au niveau maximal : un cran de la jauge par niveau. */
const LEVELS = Array.from({ length: MAX_LEVEL }, (_, index) => index + 1)

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Écran du Village : fondation, stock et bâtiments, mis à jour en temps réel. */
export function VillageScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours ; null : aucun village fondé.
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : lecture de la vue du village.
  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : chaque événement du village, y compris s'il provient d'un autre onglet
  // ou d'un autre appareil, provoque une relecture de la vue.
  const status = useChannel(villageChannel(userId), refresh)

  // Le stock est extrapolé localement deux fois par seconde, sans interroger le serveur.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  async function found(name: string) {
    const res = await client.village.$post({ json: { name } })
    handle(await res.json())
  }
  async function upgrade(building: Building) {
    const res = await client.village.upgrade.$post({ json: { building } })
    handle(await res.json())
  }
  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }

  // Fondation : le sceau s'imprime sur la charte, puis le village apparaît.
  const [sealing, setSealing] = useState(false)
  async function seal(name: string) {
    setSealing(true)
    await new Promise((resolve) => setTimeout(resolve, 900))
    await found(name)
    setSealing(false)
  }

  // Chargement en cours.
  if (view === undefined) return null

  // Aucun village : la charte de fondation.
  if (view === null) {
    return (
      <motion.section
        className="charter"
        aria-label="Fondation du village"
        initial={{ opacity: 0, scale: 0.96, rotate: -0.6 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <p className="charter-kicker">Charte de fondation</p>
        <h1>Un domaine vous est confié</h1>
        <p>
          Par la présente, le royaume vous concède une terre, une scierie, une carrière, cent
          mesures de bois et cinquante de pierre. Donnez un nom à votre village : il sera inscrit au
          registre du royaume.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            seal(String(new FormData(e.currentTarget).get('name')))
          }}
        >
          <label htmlFor="name">
            <Entity kind="quill" /> Nom du village
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={30}
            placeholder="Peyredragon, Vivesaigues..."
            autoComplete="off"
          />
          <button type="submit" className="seal-button" disabled={sealing}>
            <Entity kind="seal" /> Sceller la charte
          </button>
          {error && <p className="error">{error}</p>}
        </form>
        <AnimatePresence>
          {sealing && (
            <motion.div
              className="charter-seal"
              initial={{ scale: 3, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: -8 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            >
              <Entity kind="seal" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    )
  }

  // Village fondé : stock extrapolé à l'instant courant, puis bâtiments.
  const stock = stockAt(view, now)
  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-kicker">Votre domaine</p>
          <h1>
            <Entity kind="village" /> {view.name}
          </h1>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </header>

      <section className="coffers" aria-label="Ressources">
        {RESOURCES.map((r, index) => (
          <motion.div
            key={r}
            className="coffer"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
          >
            <Entity kind={r} />
            <strong>{Math.floor(stock[r])}</strong>
            <Entity kind={r} showLabel />
            <small>+{view.ratesPerMinute[r]} par minute</small>
          </motion.div>
        ))}
      </section>

      <h2 className="section-title">Ateliers</h2>
      <section className="workshops" aria-label="Bâtiments">
        {BUILDINGS.map((b, index) => {
          const cost = view.nextCosts[b]
          const level = view.levels[b]
          return (
            <motion.article
              key={b}
              className="workshop"
              data-built={level > 0}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.08 }}
            >
              <div className="workshop-icon">
                <Entity kind={b} />
              </div>
              <h3>
                <Entity kind={b} showLabel />
              </h3>
              <p className="muted">
                {level === 0 ? 'Non construit' : `Niveau ${level}`} · produit{' '}
                <Entity kind={CATALOG[b].produces} showLabel />
              </p>
              {/* Jauge du niveau : un cran par niveau, jusqu'au niveau maximal. */}
              <div
                className="level-pips"
                role="img"
                aria-label={`Niveau ${level} sur ${MAX_LEVEL}`}
              >
                {LEVELS.map((pip) => (
                  <span key={pip} data-on={pip <= level} />
                ))}
              </div>
              {cost ? (
                <>
                  <p className="workshop-cost">
                    {Object.entries(cost).map(([r, n]) => (
                      <span key={r} data-short={stock[r as keyof Stock] < (n ?? 0)}>
                        <Entity kind={r} /> {n}
                      </span>
                    ))}
                  </p>
                  <button
                    type="button"
                    disabled={!canAfford(stock, cost)}
                    onClick={() => upgrade(b)}
                  >
                    {level === 0 ? 'Construire' : 'Améliorer'}
                  </button>
                </>
              ) : (
                <p className="ok">Niveau maximal atteint</p>
              )}
            </motion.article>
          )
        })}
      </section>
      {error && <p className="error">{error}</p>}
    </>
  )
}
