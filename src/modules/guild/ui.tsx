'use client'
import { hc } from 'hono/client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { GuildApi } from './api'
import {
  CHANGE_COST,
  GUILD_INFO,
  GUILDS,
  type GuildId,
  type MemberError,
  type MemberView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<GuildApi>('/api/guild')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: MemberError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Guilde inconnue.',
  ALREADY_MEMBER: 'Vous avez déjà choisi votre guilde.',
  NOT_A_MEMBER: "Choisissez d'abord une guilde.",
  SAME_GUILD: 'Vous appartenez déjà à cette guilde.',
  CHANGE_PENDING: 'Un changement de guilde est déjà en cours.',
}

/** Délai entre deux relectures de la vue tant qu'un changement attend la réponse du Village. */
const PENDING_REFRESH_MS = 2000

/** Nom d'une guilde, précédé de son emblème. */
function GuildName({ guild }: { guild: GuildId }) {
  return (
    <>
      <Entity kind={`guild-${guild}`} /> {GUILD_INFO[guild].name}
    </>
  )
}

/** Écran de la Guilde : choix de la première guilde, puis changement de guilde payant. */
export function GuildScreen() {
  const router = useRouter()
  // undefined : chargement en cours.
  const [view, setView] = useState<MemberView | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : lecture de la vue de l'appartenance.
  const refresh = useCallback(async () => {
    const res = await client.index.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Un changement en attente de la réponse du Village est relu jusqu'à son issue : chaque
  // lecture distribue la boîte d'envoi, et fait ainsi reprendre la saga.
  useEffect(() => {
    if (!view?.pendingTo) return
    const timer = setInterval(refresh, PENDING_REFRESH_MS)
    return () => clearInterval(timer)
  }, [view?.pendingTo, refresh])

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  async function join(guild: GuildId) {
    const res = await client.join.$post({ json: { guild } })
    const body = await res.json()
    handle(body)
    // La mise en page du jeu, rendue sur le serveur, ouvre alors les autres pages.
    if ('view' in body) router.refresh()
  }
  async function change(guild: GuildId) {
    const res = await client.change.$post({ json: { guild } })
    handle(await res.json())
  }
  function handle(body: { view: MemberView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }

  const title = (
    <h1>
      <Entity kind="guild" /> Guildes
    </h1>
  )

  // Chargement en cours.
  if (view === undefined) return title

  // Aucune guilde : le choix, gratuit, est demandé avant toute autre page du jeu.
  if (view.guild === null) {
    return (
      <>
        {title}
        <section className="panel" aria-label="Choix de la guilde">
          <p>Choisissez la guilde que vous rejoignez. Ce premier choix est gratuit.</p>
          {GUILDS.map((guild) => (
            <div key={guild} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <GuildName guild={guild} />{' '}
                <span className="muted">({GUILD_INFO[guild].color})</span>
              </span>
              <button type="button" onClick={() => join(guild)}>
                Rejoindre
              </button>
            </div>
          ))}
          {error && <p className="error">{error}</p>}
        </section>
      </>
    )
  }

  // Membre d'une guilde : sa guilde, sa demande en cours, et le changement payant.
  const current = view.guild
  return (
    <>
      {title}
      <section className="panel" aria-label="Votre guilde">
        <h2>
          <GuildName guild={current} />
        </h2>
        {view.pendingTo && (
          <p className="muted">
            Changement vers <GuildName guild={view.pendingTo} /> en cours : le paiement est demandé
            à votre village...
          </p>
        )}
        {view.missing && (
          <p className="error">
            Changement refusé : il manquait <Entity kind="gold" /> {view.missing.gold ?? 0} à votre
            village.
          </p>
        )}
      </section>
      <section className="panel" aria-label="Changer de guilde">
        <p>
          Changer de guilde coûte <Entity kind="gold" /> {CHANGE_COST.gold}, prélevées dans votre
          village.
        </p>
        {GUILDS.filter((guild) => guild !== current).map((guild) => (
          <div key={guild} className="row" style={{ justifyContent: 'space-between' }}>
            <GuildName guild={guild} />
            <button type="button" disabled={!!view.pendingTo} onClick={() => change(guild)}>
              Rejoindre
            </button>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  )
}
