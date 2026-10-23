'use client'
import { hc } from 'hono/client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { GuildApi } from './api'
import {
  CHANGE_COST,
  type ChatError,
  dayOf,
  GUILD_INFO,
  GUILDS,
  type GuildId,
  type GuildMessage,
  guildChatChannel,
  MESSAGE_MAX_LENGTH,
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
  GUILD_LOCKED: "Vous avez rejoint la Faille aujourd'hui : votre guilde est figée jusqu'à demain.",
  ALREADY_ENTERED_TODAY: "Vous avez déjà rejoint la Faille aujourd'hui.",
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

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Message affiché au joueur pour chaque erreur du chat. */
function chatErrorText(error: ChatError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'NOT_A_MEMBER':
      return 'Ce chat est réservé aux membres de la guilde.'
    case 'EMPTY_MESSAGE':
      return 'Le message est vide.'
    case 'MESSAGE_TOO_LONG':
      return `Le message dépasse ${error.max} caractères.`
    case 'TOO_MANY_MESSAGES':
      return `Trop de messages : patientez ${Math.ceil(error.retryAfterMs / 1000)} secondes.`
    case 'INVALID_INPUT':
      return 'Saisie invalide.'
  }
}

/** Ajoute des messages à la liste, sans doublon, dans l'ordre de leurs identifiants. */
function merge(current: GuildMessage[], added: GuildMessage[]): GuildMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of added) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** Heure d'un message, au format local. */
const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Chat de la guilde du joueur, mis à jour en temps réel. Il est recréé lorsque le joueur
 * change de guilde : la liste repart vide, et le canal de la nouvelle guilde est ouvert.
 */
function GuildChat({ guild, userId }: { guild: GuildId; userId: string }) {
  const [messages, setMessages] = useState<GuildMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : les derniers messages du chat.
  const refresh = useCallback(async () => {
    const res = await client.chat.$get()
    if (!res.ok) return
    const body = await res.json()
    if ('messages' in body) setMessages((current) => merge(current, body.messages))
  }, [])

  // TEMPS RÉEL : chaque nouveau message est reçu avec son contenu, et ajouté à la liste.
  const status = useChannel(guildChatChannel(guild), (event) => {
    setMessages((current) => merge(current, [event.data as unknown as GuildMessage]))
  })

  // À chaque ouverture du canal, y compris après une reconnexion, l'historique est relu :
  // le canal ne diffuse que les messages publiés après l'abonnement.
  useEffect(() => {
    if (status === 'open') refresh()
  }, [status, refresh])

  // COMMANDE : publication d'un message.
  async function send(event: FormEvent) {
    event.preventDefault()
    const res = await client.chat.$post({ json: { body: draft } })
    const body = await res.json()
    if ('error' in body) {
      setError(chatErrorText(body.error as ChatError))
    } else {
      setError(null)
      setDraft('')
      setMessages((current) => merge(current, [body.message]))
    }
  }

  return (
    <section className="panel" aria-label="Chat de la guilde">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Chat de la guilde</h2>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>
      {messages.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
      <ul className="messages">
        {messages.map((message) => (
          <li key={message.id} data-mine={message.authorId === userId || undefined}>
            <span className="muted">{timeOf(message.postedAt)}</span>{' '}
            <strong>{message.authorName}</strong> {message.body}
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={send}>
        <input
          aria-label="Votre message"
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH * 2}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Votre message"
          style={{ flex: 1 }}
        />
        <button type="submit">Envoyer</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

/**
 * Écran de la Guilde : choix de la première guilde, puis chat de la guilde et changement de
 * guilde payant.
 */
export function GuildScreen({ userId }: { userId: string }) {
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
  const locked = view.riftDay === dayOf(Date.now())
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
        {view.refunded && (
          <p className="muted">
            Changement annulé : vous avez rejoint la Faille pendant la demande. Votre or vous a été
            remboursé.
          </p>
        )}
        {view.missing && (
          <p className="error">
            Changement refusé : il manquait <Entity kind="gold" /> {view.missing.gold ?? 0} à votre
            village.
          </p>
        )}
      </section>
      <GuildChat key={current} guild={current} userId={userId} />
      <section className="panel" aria-label="Changer de guilde">
        <p>
          Changer de guilde coûte <Entity kind="gold" /> {CHANGE_COST.gold}, prélevées dans votre
          village.
        </p>
        {locked && (
          <p className="muted">
            Vous avez rejoint la Faille aujourd'hui : votre guilde est figée jusqu'à demain.
          </p>
        )}
        {GUILDS.filter((guild) => guild !== current).map((guild) => (
          <div key={guild} className="row" style={{ justifyContent: 'space-between' }}>
            <GuildName guild={guild} />
            <button
              type="button"
              disabled={!!view.pendingTo || locked}
              onClick={() => change(guild)}
            >
              Rejoindre
            </button>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  )
}
