'use client'
import { hc } from 'hono/client'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { ExpeditionRow } from '@/ui/expedition-row'
import { Fighter } from '@/ui/fighter'
import { useCountdown } from '@/ui/use-countdown'
import type { GuildApi } from './api'
import {
  CHANGE_COST,
  type ChatError,
  dayOf,
  GUILD_INFO,
  GUILD_RANKING_CHANNEL,
  GUILDS,
  type GuildId,
  type GuildMessage,
  type GuildRanking,
  guildChatChannel,
  MAX_HEROES,
  MESSAGE_MAX_LENGTH,
  type MemberError,
  type MemberView,
  type OpenRun,
  RIFT_MONSTERS,
  ROLE_STATS,
  ROLES,
  type Role,
  type RunAction,
  type RunEffect,
  type RunError,
  type RunMonster,
  type RunView,
  runChannel,
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
    <span className="guild-name">
      <Entity kind={`guild-${guild}`} /> {GUILD_INFO[guild].name}
    </span>
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
      <Entity kind="guild" decorative /> Guildes
    </h1>
  )

  // Chargement en cours.
  if (view === undefined) return title

  // Aucune guilde : le choix, gratuit, est demandé avant toute autre page du jeu.
  if (view.guild === null) return <Allegiance />

  // Membre d'une guilde : sa maison, la Faille, le classement, le chat, et le changement payant.
  const current = view.guild
  const locked = view.riftDay === dayOf(Date.now())
  return (
    <>
      <motion.header
        className="house"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="house-emblem">
          <Entity kind={`guild-${current}`} />
        </div>
        <div>
          <p className="page-kicker">Votre maison</p>
          <h1>{GUILD_INFO[current].name}</h1>
          <p className="house-motto">« {GUILD_INFO[current].motto} »</p>
        </div>
      </motion.header>
      {view.pendingTo && (
        <p className="notice">
          Changement vers <GuildName guild={view.pendingTo} /> en cours : le paiement est demandé à
          votre village...
        </p>
      )}
      {view.refunded && (
        <p className="notice">
          Changement annulé : vous avez rejoint la Faille pendant la demande. Votre or vous a été
          remboursé.
        </p>
      )}
      {view.missing && (
        <p className="notice error">
          Changement refusé : il manquait <Entity kind="gold" /> {view.missing.gold ?? 0} à votre
          village.
        </p>
      )}

      <RiftPanel />
      <div className="guild-grid">
        <GuildChat key={current} guild={current} userId={userId} />
        <GuildRankingPanel guild={current} />
      </div>

      {/* Le changement de guilde est replié : il se fait rarement, et coûte de l'or. */}
      <details className="panel renounce">
        <summary>Renier votre serment</summary>
        <p className="muted">
          Rejoindre une autre maison coûte <Entity kind="gold" /> {CHANGE_COST.gold}, prélevées dans
          votre village.
        </p>
        {locked && (
          <p className="muted">
            Vous avez rejoint la Faille aujourd'hui : votre guilde est figée jusqu'à demain.
          </p>
        )}
        <div className="renounce-houses">
          {GUILDS.filter((guild) => guild !== current).map((guild) => (
            <div key={guild} className="renounce-house" data-guild={guild}>
              <GuildName guild={guild} />
              <span className="muted">« {GUILD_INFO[guild].motto} »</span>
              <button
                type="button"
                disabled={!!view.pendingTo || locked}
                onClick={() => change(guild)}
              >
                Rejoindre
              </button>
            </div>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </details>
    </>
  )
}

// ---------------------------------------------------------------------------
// La Faille
// ---------------------------------------------------------------------------

/** Erreurs que l'API de la Faille peut renvoyer : erreurs métier et erreur de validation. */
type RiftApiError = {
  code: RunError['code'] | 'NO_GUILD' | 'ALREADY_ENTERED_TODAY' | 'INVALID_INPUT'
  message?: string
}

/** Message affiché au joueur pour chaque erreur de la Faille. */
const RIFT_ERRORS: Record<RiftApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  NO_GUILD: "Choisissez d'abord une guilde.",
  ALREADY_ENTERED_TODAY: "Vous avez déjà rejoint la Faille aujourd'hui : revenez demain.",
  RUN_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  RUN_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  WRONG_GUILD: "Cette expédition est réservée aux membres d'une autre guilde.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Libellé de chaque rôle. */
const ROLE_LABELS: Record<Role, string> = {
  tank: 'Tank',
  healer: 'Soigneur',
  attacker: 'Attaquant',
}

/** Description courte de chaque rôle, affichée lors de son choix. */
const ROLE_HINTS: Record<Role, string> = {
  tank: 'attire les coups des monstres et en subit moins',
  healer: 'rend deux fois plus de points de vie',
  attacker: 'inflige les plus lourds dégâts',
}

/** Choix du rôle : une carte par rôle, avec son icône, ses points de vie et son effet. */
function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <fieldset className="roles">
      <legend className="sr-only">Votre rôle</legend>
      {ROLES.map((role) => (
        <button
          key={role}
          type="button"
          className="role"
          aria-pressed={value === role}
          onClick={() => onChange(role)}
        >
          <span className="role-icon">
            <Entity kind={role} decorative />
          </span>
          <span className="role-name">{ROLE_LABELS[role]}</span>
          <span className="role-stats">
            {ROLE_STATS[role].hp} PV · {ROLE_STATS[role].attack} d'attaque
          </span>
          <span className="role-hint">{ROLE_HINTS[role]}</span>
        </button>
      ))}
    </fieldset>
  )
}

/** Date d'un jour de la Faille, au format local : « vendredi 23 octobre ». */
const dateOf = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

/**
 * Accès à la Faille depuis l'écran de la Guilde : la Faille du jour et celles des jours
 * suivants, les expéditions ouvertes de la guilde, et l'ouverture d'une expédition.
 */
function RiftPanel() {
  const router = useRouter()
  const [overview, setOverview] = useState<
    | { calendar: { day: string; name: string }[]; runs: OpenRun[]; enteredToday: boolean }
    | undefined
  >(undefined)
  const [role, setRole] = useState<Role>('tank')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await client.rift.$get()
    if (res.ok) setOverview(await res.json())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open() {
    const res = await client.rift.runs.$post({ json: { role } })
    const body = await res.json()
    if ('error' in body) setError(RIFT_ERRORS[(body.error as RiftApiError).code])
    else router.push(`/guild/rift/${body.runId}`)
  }

  if (!overview) return null
  const [today, ...next] = overview.calendar
  return (
    <section className="panel rift-card" aria-label="La Faille">
      <div className="rift-portal" aria-hidden="true">
        <Entity kind="rift" />
      </div>
      <p className="page-kicker">La Faille du jour</p>
      <h2 className="rift-name">{today.name}</h2>
      <p className="muted">
        Un donjon sans fin, le même pour toutes les guildes aujourd'hui : chaque étage est plus
        difficile que le précédent, et un boss garde un étage sur cinq. Une seule expédition par
        joueur et par jour.
      </p>
      {overview.enteredToday ? (
        <p className="notice">Vous avez déjà affronté la Faille aujourd'hui : revenez demain.</p>
      ) : (
        <div className="rift-cta">
          <RoleSelect value={role} onChange={setRole} />
          <button type="button" onClick={open}>
            <Entity kind="rift" decorative /> Ouvrir une expédition
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Expéditions ouvertes de la guilde</h3>
        <button className="link" type="button" onClick={refresh}>
          Actualiser
        </button>
      </div>
      {overview.runs.length === 0 && <p className="muted">Aucune expédition ouverte.</p>}
      <ul className="games">
        {overview.runs.map((run) => (
          <ExpeditionRow
            key={run.runId}
            href={`/guild/rift/${run.runId}`}
            hostName={run.hostName}
            heroCount={run.heroCount}
            maxHeroes={MAX_HEROES}
          />
        ))}
      </ul>

      <h3>Les jours suivants</h3>
      <ul className="rift-days">
        {next.map(({ day, name }) => (
          <li key={day}>
            <span>{dateOf(day)}</span>
            {name.replace('La Faille ', '')}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Nom affiché d'un monstre, numéroté si l'étage en contient plusieurs du même type. */
function monsterName(monster: RunMonster, monsters: RunMonster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = RIFT_MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/** Description d'une action, telle que le joueur l'a choisie. */
function describeAction(action: RunAction, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

/** Préposition « de » devant un verbe à l'infinitif, élidée devant une voyelle. */
const ofVerb = (text: string) => (/^[aeéiou]/i.test(text) ? `d'${text}` : `de ${text}`)

/** Description d'un effet de la dernière manche. */
function describeEffect(effect: RunEffect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

/** Identifiants des quatre places d'une expédition. */
const SEATS = Array.from({ length: MAX_HEROES }, (_, index) => `place-${index + 1}`)

/** Écran d'une expédition de la Faille : salon, étages successifs et fin de l'expédition. */
export function RiftRun({ runId, userId }: { runId: string; userId: string }) {
  // undefined : chargement en cours ; null : expédition introuvable.
  const [view, setView] = useState<RunView | null | undefined>(undefined)
  const [role, setRole] = useState<Role>('healer')
  const [error, setError] = useState<string | null>(null)
  const param = { id: runId }

  // REQUÊTE : lecture de la vue de l'expédition, filtrée pour le joueur.
  const refresh = useCallback(async () => {
    const res = await client.rift.runs[':id'].$get({ param: { id: runId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [runId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : seuls les héros écoutent le canal de l'expédition. Le canal ne transmet
  // aucune donnée : chaque notification provoque une relecture de la vue filtrée.
  const status = useChannel(view?.isMember ? runChannel(runId) : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  function handle(body: { view: RunView } | { error: RiftApiError }) {
    if ('error' in body) {
      setError(RIFT_ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  const join = async () =>
    handle(await (await client.rift.runs[':id'].join.$post({ param, json: { role } })).json())
  const start = async () =>
    handle(await (await client.rift.runs[':id'].start.$post({ param })).json())
  async function act(action: RunAction) {
    if (!view) return
    const res = await client.rift.runs[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
  }

  // ÉCHÉANCE : lorsque le compte à rebours d'une manche atteint zéro, la commande d'échéance
  // fait enregistrer la résolution, et donc notifier tous les héros.
  const checkDeadline = useCallback(async () => {
    const res = await client.rift.runs[':id'].deadline.$post({ param: { id: runId } })
    if (res.ok) setView((await res.json()).view)
  }, [runId])
  const remaining = useCountdown(
    view?.isMember && view.phase === 'combat' ? view.deadline : null,
    checkDeadline,
  )

  const title = (
    <header className="page-header">
      <div>
        <p className="page-kicker">
          {view ? (
            <>
              Expédition de la guilde <GuildName guild={view.guild} />
            </>
          ) : (
            'Expédition'
          )}
        </p>
        <h1>
          <Entity kind="rift" decorative /> {view?.name ?? 'La Faille'}
        </h1>
      </div>
      {view?.isMember && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </header>
  )

  if (view === undefined) return title
  if (view === null) {
    return (
      <>
        {title}
        <p className="error">{RIFT_ERRORS.RUN_NOT_FOUND}</p>
        <Link href="/guild">Retour à la Guilde</Link>
      </>
    )
  }

  // Noms des combattants, pour décrire les actions et les effets.
  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((m) => m.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }
  const me = view.heroes.find((hero) => hero.id === userId)
  const standingMonsters = view.monsters.filter((monster) => monster.hp > 0)
  const standingHeroes = view.heroes.filter((hero) => hero.hp > 0)
  // Places de l'expédition : les héros, puis les places encore libres.
  const freeSeats = SEATS.slice(view.heroes.length)

  return (
    <>
      {title}

      {/* Salon : les quatre places de l'expédition, à rejoindre ou à lancer. */}
      {view.phase === 'lobby' && (
        <section className="panel" aria-label="Salon">
          <h2>Le groupe se rassemble</h2>
          <div className="party">
            {view.heroes.map((hero) => (
              <div key={hero.id} className="seat" data-role={hero.role}>
                <Entity kind={hero.role} />
                <strong>{hero.name}</strong>
                <span className="muted">
                  {ROLE_LABELS[hero.role]}
                  {hero.id === view.hostId && ' · hôte'}
                </span>
              </div>
            ))}
            {freeSeats.map((seat) => (
              <div key={seat} className="seat" data-free="true">
                <span className="muted">Place libre</span>
              </div>
            ))}
          </div>
          {!view.isMember && view.heroes.length < MAX_HEROES && (
            <div className="rift-cta">
              <RoleSelect value={role} onChange={setRole} />
              <button type="button" onClick={join}>
                Rejoindre l'expédition
              </button>
            </div>
          )}
          {view.isHost && (
            <button type="button" className="big-button" onClick={start}>
              <Entity kind="rift" decorative /> Entrer dans la Faille
            </button>
          )}
          {view.isMember && !view.isHost && (
            <p className="muted">En attente du lancement par l'hôte.</p>
          )}
        </section>
      )}

      {/* Combat : l'étage, le compte à rebours, puis les héros face aux monstres. */}
      {view.phase === 'combat' && (
        <>
          <section className="floor" data-boss={view.bossFloor}>
            <div>
              <p className="page-kicker">{view.bossFloor ? 'Le Gardien vous attend' : 'Étage'}</p>
              <motion.strong
                key={view.floor}
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 180, damping: 14 }}
              >
                {view.floor}
              </motion.strong>
            </div>
            <div className="floor-round">
              <span className="muted">Manche {view.round}</span>
              {remaining !== null && (
                <span className="countdown" data-urgent={remaining <= 5}>
                  {remaining} s
                </span>
              )}
            </div>
          </section>

          <section className="battlefield" aria-label="Combat">
            <div className="side">
              {view.heroes.map((hero) => (
                <Fighter
                  key={hero.id}
                  kind={hero.role}
                  name={hero.name}
                  detail={ROLE_LABELS[hero.role]}
                  hp={hero.hp}
                  maxHp={hero.maxHp}
                  mine={hero.id === userId}
                  badge={hero.ready ? 'prêt' : null}
                />
              ))}
            </div>
            <div className="versus" aria-hidden="true">
              contre
            </div>
            <div className="side">
              {view.monsters.map((monster) => (
                <Fighter
                  key={`${view.floor}-${monster.id}`}
                  kind={monster.kind}
                  name={monsterName(monster, view.monsters)}
                  detail={`${monster.attack} d'attaque`}
                  hp={monster.hp}
                  maxHp={monster.maxHp}
                  foe
                />
              ))}
            </div>
          </section>

          <section className="panel" aria-label="Votre action">
            {me && me.hp > 0 && !me.action && (
              <div className="actions">
                {standingMonsters.map((monster) => (
                  <button
                    key={monster.id}
                    type="button"
                    onClick={() => act({ type: 'attack', target: monster.id })}
                  >
                    <Entity kind="attacker" decorative /> Attaquer{' '}
                    {monsterName(monster, view.monsters)}
                  </button>
                ))}
                <button type="button" onClick={() => act({ type: 'defend' })}>
                  <Entity kind="tank" decorative /> Se défendre
                </button>
                {standingHeroes.map((hero) => (
                  <button
                    key={hero.id}
                    type="button"
                    onClick={() => act({ type: 'heal', target: hero.id })}
                  >
                    <Entity kind="healer" decorative /> Soigner {hero.name}
                  </button>
                ))}
              </div>
            )}
            {me?.action && (
              <p className="muted">
                Votre choix : {describeAction(me.action, nameOf)}. En attente des autres héros.
              </p>
            )}
            {me && me.hp <= 0 && <p className="muted">Votre héros est tombé.</p>}
            {!me && <p className="muted">Vous observez cette expédition.</p>}
          </section>
        </>
      )}

      {/* Fin de l'expédition. */}
      {view.phase === 'ended' && (
        <motion.section
          className="panel run-end"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <p className="page-kicker">Le groupe est tombé</p>
          <strong>{view.floorsCleared}</strong>
          <span>
            étage{view.floorsCleared > 1 ? 's' : ''} franchi{view.floorsCleared > 1 ? 's' : ''}
          </span>
          <Link href="/guild" className="button">
            Retour à la Guilde
          </Link>
        </motion.section>
      )}

      {/* Chronique de la dernière manche, connue de tous une fois la manche résolue. */}
      {view.lastRound && (
        <section className="panel chronicle" aria-label="Dernière manche">
          <h2>Chronique de la manche {view.lastRound.round}</h2>
          <ul className="log">
            {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
              <li key={heroId}>
                {nameOf(heroId)} a choisi {ofVerb(describeAction(action, nameOf))}.
              </li>
            ))}
            {view.lastRound.effects.map((effect) => (
              // Chaque combattant n'agit qu'une fois par manche : ce triplet identifie l'effet.
              <li key={`${effect.kind}-${effect.source}-${effect.target}`} data-kind={effect.kind}>
                {describeEffect(effect, nameOf)}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Classement des guildes
// ---------------------------------------------------------------------------

/** Délai entre deux relectures, tant que la projection n'a pas atteint l'événement annoncé. */
const RETRY_MS = 1_000

/** Nombre maximal de relectures pour un même événement annoncé. */
const MAX_READS = 10

/**
 * Classement des guildes : le meilleur score de chacune aujourd'hui, et de tous les temps.
 * La guilde du joueur y est mise en évidence.
 */
function GuildRankingPanel({ guild }: { guild: GuildId }) {
  const [ranking, setRanking] = useState<GuildRanking | undefined>(undefined)

  // REQUÊTE : la lecture déclenche, côté serveur, le rattrapage de la projection.
  // Renvoie la position jusqu'à laquelle le classement reçu est à jour ; 0 en cas d'échec.
  const refresh = useCallback(async () => {
    const res = await client.ranking.$get()
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

  // TEMPS RÉEL : le canal annonce la fin d'une expédition. Comme pour le Classement, le
  // classement est relu jusqu'à ce que la projection ait atteint la position annoncée.
  const follow = useCallback(
    async (event: ChannelEvent) => {
      wanted.current = Math.max(wanted.current, event.position)
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

  useChannel(GUILD_RANKING_CHANNEL, follow)

  if (!ranking) return null
  return (
    <section className="panel" aria-label="Classement des guildes">
      <h2>
        <Entity kind="ranking" decorative /> Classement des guildes
      </h2>
      <p className="muted">
        Étages franchis par la meilleure expédition de chaque guilde. Une expédition abandonnée
        n'est comptée que le lendemain matin.
      </p>
      <table className="ranking">
        <thead>
          <tr>
            <th aria-label="Rang">#</th>
            <th>Guilde</th>
            <th>Aujourd'hui</th>
            <th>Record</th>
          </tr>
        </thead>
        <tbody>
          {ranking.guilds.map((standing, index) => (
            <tr key={standing.guild} aria-current={standing.guild === guild ? 'true' : undefined}>
              <td>{index + 1}</td>
              <td>
                <GuildName guild={standing.guild} />
              </td>
              <td>
                {standing.today}
                <small className="muted">
                  {standing.todayRuns} expédition{standing.todayRuns > 1 ? 's' : ''}
                </small>
              </td>
              <td>{standing.allTime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Choix de la guilde : la cérémonie d'allégeance
// ---------------------------------------------------------------------------

/** Durée minimale de la cérémonie, en millisecondes, avant l'arrivée au village. */
const OATH_MS = 4400

/** Durée de l'effet propre à chaque guilde, en secondes, avant l'apparition du blason. */
const EFFECT_S = 1.1

/** Griffures du dragon : trois entailles en diagonale, tracées l'une après l'autre. */
const CLAWS = ['M 22 4 Q 40 46 66 96', 'M 36 2 Q 54 44 80 94', 'M 50 0 Q 68 42 94 90']

/** Racines du chêne : elles poussent du bas de l'écran, et se ramifient en montant. */
const ROOTS = [
  'M 50 102 C 48 88 54 78 50 64 C 47 54 52 46 50 38',
  'M 50 102 C 40 92 30 90 22 80 C 16 72 10 70 2 66',
  'M 50 102 C 60 92 70 90 78 80 C 84 72 90 70 98 66',
  'M 50 80 C 44 74 38 72 34 62',
  'M 50 76 C 57 70 62 66 66 56',
  'M 22 80 C 24 70 20 62 24 52',
  'M 78 80 C 76 70 80 62 76 52',
  'M 2 102 C 8 94 10 86 8 76',
  'M 98 102 C 92 94 90 86 92 76',
]

/** Ouragan de l'Onde : des anneaux d'écume, tournant à des vitesses différentes. */
const SWIRLS = [
  { r: 12, dash: '30 70', turns: 900, width: 1.6 },
  { r: 20, dash: '45 55', turns: -720, width: 1.2 },
  { r: 28, dash: '25 75', turns: 640, width: 1.8 },
  { r: 36, dash: '55 45', turns: -540, width: 1 },
  { r: 44, dash: '20 80', turns: 460, width: 1.4 },
]

/** Nombre de particules de chaque guilde : braises, gouttes d'écume ou feuilles. */
const PARTICLES: Record<GuildId, number> = { red: 34, blue: 40, green: 22 }

/** Particule tirée au hasard : sa position de départ, son retard, sa taille et sa dérive. */
interface Particle {
  key: string
  x: number
  delay: number
  size: number
  drift: number
  turn: number
}

/**
 * Particules de la cérémonie, propres à chaque guilde : des braises qui montent du bas de
 * l'écran pour le Dragon, des gouttes projetées par l'ouragan pour l'Onde, des feuilles de
 * chêne qui tombent en tournoyant pour le Chêne. Leur hasard est purement visuel : il est
 * tiré une fois, à l'ouverture de la cérémonie.
 */
function OathParticles({ guild }: { guild: GuildId }) {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLES[guild] }, (_, index) => ({
        key: `${guild}-${index}`,
        x: Math.random() * 100,
        delay: Math.random() * 1.4,
        size: 0.5 + Math.random(),
        drift: (Math.random() - 0.5) * 30,
        turn: (Math.random() - 0.5) * 720,
      })),
    [guild],
  )

  return (
    <div className="oath-particles" data-kind={guild} aria-hidden="true">
      {particles.map((p, index) => {
        if (guild === 'red') {
          // Braise : elle monte du bas de l'écran en ondulant, puis s'éteint.
          return (
            <motion.span
              key={p.key}
              className="ember"
              style={{ left: `${p.x}%`, width: 4 * p.size + 2, height: 4 * p.size + 2 }}
              initial={{ y: '102vh', opacity: 0 }}
              animate={{ y: '-10vh', x: [0, p.drift, -p.drift, 0], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.4 + p.size, delay: p.delay, ease: 'easeOut' }}
            />
          )
        }
        if (guild === 'blue') {
          // Goutte : projetée du centre de l'ouragan, elle file en spirale vers le bord.
          const angle = (index / particles.length) * Math.PI * 2 + p.drift / 20
          const distance = 40 + p.size * 25
          return (
            <motion.span
              key={p.key}
              className="drop"
              style={{ width: 3 * p.size + 2, height: 3 * p.size + 2 }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: [
                  `0vmin`,
                  `${Math.cos(angle + 0.8) * distance * 0.5}vmin`,
                  `${Math.cos(angle + 1.6) * distance}vmin`,
                ],
                y: [
                  `0vmin`,
                  `${Math.sin(angle + 0.8) * distance * 0.5}vmin`,
                  `${Math.sin(angle + 1.6) * distance}vmin`,
                ],
                opacity: [0, 1, 0],
                scale: [0.4, 1.2, 0.8],
              }}
              transition={{
                duration: 1.6 + p.size * 0.6,
                delay: 0.15 + p.delay * 0.6,
                ease: 'easeOut',
              }}
            />
          )
        }
        // Feuille : elle tombe du haut de l'écran en se balançant et en tournoyant.
        return (
          <motion.span
            key={p.key}
            className="leaf"
            style={{ left: `${p.x}%`, fontSize: `${0.9 + p.size}rem` }}
            initial={{ y: '-8vh', opacity: 0, rotate: 0 }}
            animate={{
              y: '105vh',
              x: [0, p.drift * 2, -p.drift * 2, p.drift],
              rotate: p.turn,
              opacity: [0, 1, 1, 0.6],
            }}
            transition={{ duration: 3 + p.size, delay: 0.4 + p.delay, ease: 'easeIn' }}
          >
            <Entity kind="leaf" decorative />
          </motion.span>
        )
      })}
    </div>
  )
}

/**
 * Effet propre à chaque guilde, joué avant l'apparition de son blason : les griffures du
 * dragon, l'ouragan de l'onde ou les racines du chêne. Il est dessiné en SVG, et animé par
 * motion, qui le réduit à un fondu pour les joueurs qui demandent moins d'animations.
 */
function OathEffect({ guild }: { guild: GuildId }) {
  if (guild === 'red') {
    return (
      <motion.svg
        className="oath-effect"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        // L'écran tremble sous chaque coup de griffe.
        animate={{ x: [0, -14, 10, -8, 6, 0] }}
        transition={{ duration: 0.6, delay: 0.25 }}
      >
        {CLAWS.map((d, index) => (
          <g key={d}>
            <motion.path
              d={d}
              className="claw"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 1, 1, 0.55] }}
              transition={{ delay: 0.2 + index * 0.12, duration: 0.32, ease: 'easeIn' }}
            />
            <motion.path
              d={d}
              className="claw-core"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.2 + index * 0.12, duration: 0.32, ease: 'easeIn' }}
            />
          </g>
        ))}
      </motion.svg>
    )
  }
  if (guild === 'blue') {
    return (
      <motion.svg
        className="oath-effect"
        viewBox="0 0 100 100"
        aria-hidden="true"
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.1, 1.6], opacity: [0, 1, 0.5] }}
        transition={{ duration: EFFECT_S + 0.9, times: [0, 0.55, 1], ease: 'easeOut' }}
      >
        {SWIRLS.map((swirl) => (
          <motion.circle
            key={swirl.r}
            cx="50"
            cy="50"
            r={swirl.r}
            pathLength={100}
            strokeDasharray={swirl.dash}
            strokeWidth={swirl.width}
            className="swirl"
            style={{ transformOrigin: '50px 50px' }}
            animate={{ rotate: swirl.turns }}
            transition={{ duration: EFFECT_S + 0.9, ease: 'easeOut' }}
          />
        ))}
      </motion.svg>
    )
  }
  // Les racines s'estompent une fois sorties de terre, pour laisser lire le serment.
  return (
    <motion.svg
      className="oath-effect"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      animate={{ opacity: [1, 1, 0.45] }}
      transition={{ duration: EFFECT_S + 1, times: [0, 0.6, 1] }}
    >
      {ROOTS.map((d, index) => (
        <motion.path
          key={d}
          d={d}
          className="root"
          strokeWidth={index < 3 ? 2.4 : 1.2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            delay: index < 3 ? 0.1 : 0.45 + index * 0.05,
            duration: 0.8,
            ease: 'easeOut',
          }}
        />
      ))}
    </motion.svg>
  )
}

/**
 * Choix de la première guilde : trois bannières côte à côte. Le choix ouvre une cérémonie,
 * dont la couleur envahit l'écran, puis conduit le joueur à son village, ou à sa fondation.
 */
function Allegiance() {
  const [sworn, setSworn] = useState<GuildId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function swear(guild: GuildId) {
    // Un seul serment : un second clic, pendant la cérémonie, est sans effet.
    if (sworn !== null) return
    setError(null)
    setSworn(guild)
    // La cérémonie dure au moins OATH_MS, même si la réponse arrive plus tôt.
    const [res] = await Promise.all([
      client.join.$post({ json: { guild } }),
      new Promise((resolve) => setTimeout(resolve, OATH_MS)),
    ])
    const body = await res.json()
    if ('error' in body) {
      setSworn(null)
      setError(ERRORS[(body.error as ApiError).code])
      return
    }
    // Le cadre du jeu, rendu sur le serveur, doit connaître la nouvelle guilde : la page du
    // village est chargée entièrement, dans les couleurs de la guilde.
    document.documentElement.dataset.guild = guild
    window.location.assign('/village')
  }

  return (
    <section className="allegiance" aria-label="Choix de la guilde">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <p className="allegiance-kicker">Le royaume vous appelle</p>
        <h1>Prêtez allégeance</h1>
        <p className="muted">
          Trois maisons se disputent la Faille. Choisissez la vôtre : ce premier serment est
          gratuit, le renier vous coûtera de l'or.
        </p>
      </motion.header>

      <div className="banners">
        {GUILDS.map((guild, index) => (
          <motion.article
            key={guild}
            className="banner"
            data-guild={guild}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.15, duration: 0.6, ease: 'easeOut' }}
            whileHover={{ y: -10 }}
          >
            {/* La bannière entière vaut serment, comme son bouton ; elle est retirée de l'ordre
                de tabulation, le bouton restant le point d'accès au clavier. */}
            <button
              type="button"
              className="banner-cloth"
              tabIndex={-1}
              aria-hidden="true"
              disabled={sworn !== null}
              onClick={() => swear(guild)}
            >
              <span className="banner-emblem">
                <Entity kind={`guild-${guild}`} />
              </span>
              <span className="banner-name">{GUILD_INFO[guild].name}</span>
              <span className="banner-motto">« {GUILD_INFO[guild].motto} »</span>
              <span className="banner-portrait">{GUILD_INFO[guild].portrait}</span>
            </button>
            <button
              type="button"
              disabled={sworn !== null}
              onClick={() => swear(guild)}
              aria-label={`Prêter allégeance à ${GUILD_INFO[guild].name}`}
            >
              Prêter allégeance
            </button>
          </motion.article>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      <AnimatePresence>
        {sworn && (
          <motion.div
            className="oath"
            data-guild={sworn}
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <OathEffect guild={sworn} />
            <OathParticles guild={sworn} />
            <motion.div
              className="oath-emblem"
              initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ delay: EFFECT_S, type: 'spring', stiffness: 90, damping: 12 }}
            >
              <Entity kind={`guild-${sworn}`} />
            </motion.div>
            <motion.p
              className="oath-text"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: EFFECT_S + 0.5, duration: 0.6 }}
            >
              Vous prêtez allégeance à<strong>{GUILD_INFO[sworn].name}</strong>
            </motion.p>
            <motion.p
              className="oath-motto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: EFFECT_S + 1, duration: 0.8 }}
            >
              « {GUILD_INFO[sworn].motto} »
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
