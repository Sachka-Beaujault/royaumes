'use client'
import { hc } from 'hono/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
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
      <RiftPanel />
      <GuildRankingPanel guild={current} />
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

/** Liste de choix du rôle, avec ses caractéristiques. */
function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <select aria-label="Rôle" value={value} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]} : {ROLE_STATS[role].hp} PV, {ROLE_HINTS[role]}
        </option>
      ))}
    </select>
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
    <section className="panel" aria-label="La Faille">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>
          <Entity kind="rift" /> {today.name}
        </h2>
        <button className="link" type="button" onClick={refresh}>
          Actualiser
        </button>
      </div>
      <p className="muted">
        Un donjon sans fin, le même pour toutes les guildes aujourd'hui : chaque étage est plus
        difficile que le précédent, et un boss garde un étage sur cinq. Une seule expédition par
        joueur et par jour.
      </p>
      {overview.enteredToday ? (
        <p className="muted">Vous avez déjà affronté la Faille aujourd'hui : revenez demain.</p>
      ) : (
        <div className="row">
          <RoleSelect value={role} onChange={setRole} />
          <button type="button" onClick={open}>
            Ouvrir une expédition
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <h3>Expéditions ouvertes de la guilde</h3>
      {overview.runs.length === 0 && <p className="muted">Aucune expédition ouverte.</p>}
      <ul className="games">
        {overview.runs.map((run) => (
          <li key={run.runId}>
            <span>
              Expédition de {run.hostName}{' '}
              <span className="muted">
                ({run.heroCount}/{MAX_HEROES} héros)
              </span>
            </span>
            <Link href={`/guild/rift/${run.runId}`}>Voir</Link>
          </li>
        ))}
      </ul>
      <h3>Les jours suivants</h3>
      <ul className="log">
        {next.map(({ day, name }) => (
          <li key={day}>
            <span className="muted">{dateOf(day)} :</span> {name}
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
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="rift" /> {view?.name ?? 'La Faille'}
      </h1>
      {view?.isMember && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
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

  return (
    <>
      {title}
      <p className="muted">
        Expédition de la guilde <GuildName guild={view.guild} />
      </p>

      {/* Héros de l'expédition. */}
      <section className="panel heroes" aria-label="Héros">
        {view.heroes.map((hero) => (
          <div key={hero.id} className="fighter" data-down={hero.hp <= 0}>
            <span>
              <Entity kind={hero.role} /> {hero.name}{' '}
              <span className="muted">({ROLE_LABELS[hero.role]})</span>
              {hero.id === view.hostId && <span className="muted"> (hôte)</span>}
            </span>
            <span className="muted">
              {hero.hp}/{hero.maxHp} PV
            </span>
            {view.phase === 'combat' && hero.ready && <span className="ok">prêt</span>}
          </div>
        ))}
      </section>

      {/* Salon : rejoindre ou lancer l'expédition. */}
      {view.phase === 'lobby' && (
        <div className="panel">
          {!view.isMember && view.heroes.length < MAX_HEROES && (
            <div className="row">
              <RoleSelect value={role} onChange={setRole} />
              <button type="button" onClick={join}>
                Rejoindre l'expédition
              </button>
            </div>
          )}
          {view.isHost && (
            <button type="button" onClick={start}>
              Entrer dans la Faille
            </button>
          )}
          {view.isMember && !view.isHost && (
            <p className="muted">En attente du lancement par l'hôte.</p>
          )}
        </div>
      )}

      {/* Combat : monstres de l'étage, compte à rebours et choix de l'action. */}
      {view.phase === 'combat' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              Étage {view.floor}
              {view.bossFloor && ' - le Gardien'}, manche {view.round}
            </h2>
            {remaining !== null && <span className="countdown">{remaining} s</span>}
          </div>
          <div className="monsters">
            {view.monsters.map((monster) => (
              <div key={monster.id} className="fighter" data-down={monster.hp <= 0}>
                <span>
                  <Entity kind={monster.kind} /> {monsterName(monster, view.monsters)}
                </span>
                <span className="muted">
                  {monster.hp}/{monster.maxHp} PV
                </span>
              </div>
            ))}
          </div>
          {me && me.hp > 0 && !me.action && (
            <div className="actions">
              {standingMonsters.map((monster) => (
                <button
                  key={monster.id}
                  type="button"
                  onClick={() => act({ type: 'attack', target: monster.id })}
                >
                  Attaquer {monsterName(monster, view.monsters)}
                </button>
              ))}
              <button type="button" onClick={() => act({ type: 'defend' })}>
                Se défendre
              </button>
              {standingHeroes.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  onClick={() => act({ type: 'heal', target: hero.id })}
                >
                  Soigner {hero.name}
                </button>
              ))}
            </div>
          )}
          {me?.action && (
            <p className="muted">
              Votre choix : {describeAction(me.action, nameOf)}. En attente des autres héros.
            </p>
          )}
        </div>
      )}

      {/* Fin de l'expédition. */}
      {view.phase === 'ended' && (
        <div className="panel">
          <h2>Le groupe est tombé</h2>
          <p>
            Étages franchis : <strong>{view.floorsCleared}</strong>
          </p>
          <Link href="/guild">Retour à la Guilde</Link>
        </div>
      )}

      {/* Résultat de la dernière manche, connu de tous une fois la manche résolue. */}
      {view.lastRound && (
        <section className="panel" aria-label="Dernière manche">
          <h2>Manche {view.lastRound.round}</h2>
          <ul className="log">
            {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
              <li key={heroId}>
                {nameOf(heroId)} a choisi {ofVerb(describeAction(action, nameOf))}.
              </li>
            ))}
            {view.lastRound.effects.map((effect) => (
              // Chaque combattant n'agit qu'une fois par manche : ce triplet identifie l'effet.
              <li key={`${effect.kind}-${effect.source}-${effect.target}`}>
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
        <Entity kind="ranking" /> Classement des guildes
      </h2>
      <p className="muted">
        Étages franchis par la meilleure expédition de chaque guilde. Une expédition abandonnée
        n'est comptée que le lendemain matin.
      </p>
      <table className="ranking">
        <thead>
          <tr>
            <th>Rang</th>
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
                {standing.today}{' '}
                <span className="muted">
                  ({standing.todayRuns} expédition{standing.todayRuns > 1 ? 's' : ''})
                </span>
              </td>
              <td>{standing.allTime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
