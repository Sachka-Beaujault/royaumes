'use client'
import { hc } from 'hono/client'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { Fighter } from '@/ui/fighter'
import { useCountdown } from '@/ui/use-countdown'
import type { DungeonApi } from './api'
import {
  type Action,
  DIFFICULTIES,
  type Difficulty,
  type Effect,
  type GameError,
  type GameView,
  gameChannel,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<DungeonApi>('/api/dungeon')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  GAME_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  NOT_YOUR_TURN: "Ce n'est pas votre tour.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Libellé de chaque niveau de difficulté. */
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Facile', hard: 'Difficile' }

/** Description de chaque niveau de difficulté, affichée lors de son choix. */
const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: 'Les monstres frappent au hasard. Pour une première descente.',
  hard: 'Les monstres frappent plus fort, et visent le héros le plus affaibli.',
}

/** Identifiants des quatre places d'une expédition. */
const SEATS = Array.from({ length: MAX_HEROES }, (_, index) => `place-${index + 1}`)

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

// ---------------------------------------------------------------------------
// Liste des expéditions ouvertes
// ---------------------------------------------------------------------------

/** Écran d'accueil du Donjon : expéditions ouvertes et ouverture d'une expédition. */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')

  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open() {
    const res = await client.games.$post({ json: { difficulty } })
    if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-kicker">Sous les ruines du royaume</p>
          <h1>
            <Entity kind="dungeon" /> Donjon
          </h1>
        </div>
      </header>
      <p className="muted">
        Six salles, des trésors, et un troll au fond. Descendez seul avec des compagnons, ou jusqu'à
        quatre héros.
      </p>

      <section className="difficulties" aria-label="Niveau de difficulté">
        {DIFFICULTIES.map((level) => (
          <button
            key={level}
            type="button"
            className="difficulty"
            aria-pressed={difficulty === level}
            onClick={() => setDifficulty(level)}
          >
            <span className="difficulty-name">{DIFFICULTY_LABELS[level]}</span>
            <span className="difficulty-hint">{DIFFICULTY_HINTS[level]}</span>
          </button>
        ))}
      </section>
      <button type="button" className="big-button" onClick={open}>
        <Entity kind="door" /> Ouvrir une expédition ({DIFFICULTY_LABELS[difficulty].toLowerCase()})
      </button>

      <section className="panel" aria-label="Expéditions ouvertes">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Expéditions ouvertes</h2>
          <button className="link" type="button" onClick={refresh}>
            Actualiser
          </button>
        </div>
        {games?.length === 0 && <p className="muted">Aucune expédition ouverte pour le moment.</p>}
        <ul className="games">
          {games?.map((game) => (
            <li key={game.gameId}>
              <span>
                Expédition de {game.hostName}{' '}
                <span className="muted">
                  ({game.heroCount}/{MAX_HEROES} héros)
                </span>
              </span>
              <Link href={`/dungeon/${game.gameId}`}>Rejoindre</Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Expédition
// ---------------------------------------------------------------------------

/** Nom affiché d'un monstre, numéroté si la salle en contient plusieurs du même type. */
function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/** Description d'une action, telle que le joueur l'a choisie. */
function describeAction(action: Action, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

/** Préposition « de » devant un verbe à l'infinitif, élidée devant une voyelle. */
const ofVerb = (text: string) => (/^[aeéiou]/i.test(text) ? `d'${text}` : `de ${text}`)

/** Description d'un effet de la dernière manche. */
function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

/** Écran d'une expédition : salon, exploration, combat et fin de l'expédition. */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  // undefined : chargement en cours ; null : expédition introuvable.
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const param = { id: gameId }

  // REQUÊTE : lecture de la vue de l'expédition, filtrée pour le joueur.
  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : seuls les membres écoutent le canal de l'expédition. Le canal ne transmet
  // aucune donnée : chaque notification provoque une relecture de la vue filtrée.
  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  function handle(body: { view: GameView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  const addCompanion = async () =>
    handle(await (await client.games[':id'].companion.$post({ param })).json())
  const join = async () => handle(await (await client.games[':id'].join.$post({ param })).json())
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  const openDoor = async () =>
    handle(await (await client.games[':id'].door.$post({ param })).json())
  async function act(action: Action) {
    if (!view) return
    const res = await client.games[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
  }

  // ÉCHÉANCE : lorsque le compte à rebours d'une manche ou d'un tour d'exploration atteint
  // zéro, la commande d'échéance fait enregistrer la suite de l'expédition, et donc
  // notifier tous les membres.
  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])
  const remaining = useCountdown(
    view?.isMember && (view.phase === 'combat' || view.phase === 'exploring')
      ? view.deadline
      : null,
    checkDeadline,
  )

  const title = (
    <header className="page-header">
      <div>
        <p className="page-kicker">
          Expédition{view && ` · ${DIFFICULTY_LABELS[view.difficulty].toLowerCase()}`}
        </p>
        <h1>
          <Entity kind="dungeon" /> Donjon
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
        <p className="error">{ERRORS.GAME_NOT_FOUND}</p>
        <Link href="/dungeon">Retour au Donjon</Link>
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
  const freeSeats = SEATS.slice(view.heroes.length)
  const ended = view.phase === 'won' || view.phase === 'lost'

  return (
    <>
      {title}

      {/* Progression dans le donjon : une porte par salle, la dernière gardée par le troll. */}
      {view.phase !== 'lobby' && (
        <section className="corridor" aria-label={`Salle ${view.room + 1} sur ${view.roomCount}`}>
          {Array.from({ length: view.roomCount }, (_, room) => `salle-${room}`).map((key, room) => (
            <span
              key={key}
              className="corridor-room"
              data-state={room < view.room ? 'done' : room === view.room ? 'here' : 'ahead'}
            >
              <Entity kind={room === view.roomCount - 1 ? 'troll' : 'door'} />
            </span>
          ))}
          <span className="corridor-loot">
            <Entity kind="gold" /> {view.loot}
          </span>
        </section>
      )}

      {/* Salon : les quatre places de l'expédition. */}
      {view.phase === 'lobby' && (
        <section className="panel" aria-label="Salon">
          <h2>Le groupe se rassemble</h2>
          <p className="muted">
            Communiquez l'adresse de cette page aux joueurs que vous souhaitez inviter.
          </p>
          <div className="party">
            {view.heroes.map((hero) => (
              <div key={hero.id} className="seat">
                <Entity kind={hero.companion ? 'companion' : 'hero'} />
                <strong>{hero.name}</strong>
                <span className="muted">
                  {hero.companion ? "Piloté par l'ordinateur" : 'Héros'}
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
          <div className="row">
            {!view.isMember && view.heroes.length < MAX_HEROES && (
              <button type="button" onClick={join}>
                Rejoindre l'expédition
              </button>
            )}
            {view.isHost && view.heroes.length < MAX_HEROES && (
              <button type="button" onClick={addCompanion}>
                <Entity kind="companion" /> Ajouter un compagnon
              </button>
            )}
            {view.isHost && (
              <button type="button" className="big-button" onClick={start}>
                <Entity kind="door" /> Entrer dans le donjon
              </button>
            )}
          </div>
          {view.isMember && !view.isHost && (
            <p className="muted">En attente du lancement par l'hôte.</p>
          )}
        </section>
      )}

      {/* Exploration : la salle courante, puis la porte suivante, à tour de rôle. */}
      {view.phase === 'exploring' && (
        <motion.section
          key={view.room}
          className="panel chamber"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p className="page-kicker">
              {view.room < 0
                ? "À l'entrée du donjon"
                : `Salle ${view.room + 1} sur ${view.roomCount}`}
            </p>
            {remaining !== null && (
              <span className="countdown" title="La porte s'ouvrira d'elle-même">
                {remaining} s
              </span>
            )}
          </div>
          <h2>
            {view.currentRoom?.kind === 'treasure' &&
              `Un trésor : ${view.currentRoom.gold} pièces d'or !`}
            {view.currentRoom?.kind === 'empty' && 'Une salle vide, silencieuse.'}
            {view.currentRoom?.kind === 'monsters' && 'Les monstres sont vaincus.'}
            {!view.currentRoom && 'Une lourde porte vous fait face.'}
          </h2>
          {view.turnHeroId === userId ? (
            <button type="button" className="big-button" onClick={openDoor}>
              <Entity kind="door" /> Ouvrir la porte suivante
            </button>
          ) : (
            <p className="muted">Au tour de {nameOf(view.turnHeroId ?? '')} d'ouvrir la porte.</p>
          )}
        </motion.section>
      )}

      {/* Combat : les héros face aux monstres, puis le choix de l'action. */}
      {view.phase === 'combat' && (
        <>
          <section className="floor">
            <div>
              <p className="page-kicker">Salle {view.room + 1}</p>
              <strong>Combat</strong>
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
                  kind={hero.companion ? 'companion' : 'hero'}
                  name={hero.name}
                  detail={hero.companion ? "Piloté par l'ordinateur" : 'Héros'}
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
                  key={`${view.room}-${monster.id}`}
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
                    <Entity kind="attacker" /> Attaquer {monsterName(monster, view.monsters)}
                  </button>
                ))}
                <button type="button" onClick={() => act({ type: 'defend' })}>
                  <Entity kind="tank" /> Se défendre
                </button>
                {standingHeroes.map((hero) => (
                  <button
                    key={hero.id}
                    type="button"
                    onClick={() => act({ type: 'heal', target: hero.id })}
                  >
                    <Entity kind="healer" /> Soigner {hero.name}
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
      {ended && (
        <motion.section
          className="panel run-end"
          data-result={view.phase}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <p className="page-kicker">
            {view.phase === 'won' ? 'Le troll est tombé' : 'Le groupe est tombé'}
          </p>
          <strong>{view.phase === 'won' ? 'Victoire' : 'Défaite'}</strong>
          <span>
            Butin : <Entity kind="gold" /> {view.loot}
          </span>
          <Link href="/dungeon" className="button">
            Retour au Donjon
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
