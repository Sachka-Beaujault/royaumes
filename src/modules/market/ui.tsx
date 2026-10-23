'use client'
import { hc } from 'hono/client'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RESOURCES, type Resource } from '@/modules/realm/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { MarketApi } from './api'
import {
  type Amounts,
  MARKET_CHANNEL,
  type MarketList,
  type OfferError,
  type OfferStatus,
  type OfferView,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<MarketApi>('/api/market')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Libellé de chaque état d'une offre. */
const OFFER_STATUS: Record<OfferStatus, string> = {
  reserving: 'Réservation en cours',
  open: 'Ouverte',
  settling: 'Règlement en cours',
  completed: 'Échange conclu',
  rejected: 'Refusée : stock insuffisant',
  withdrawn: 'Retirée',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<OfferError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  OFFER_NOT_FOUND: 'Offre introuvable.',
  ALREADY_EXISTS: 'Offre déjà publiée.',
  NOT_OPEN: "L'offre n'est plus disponible.",
  OWN_OFFER: 'Vous ne pouvez pas accepter votre propre offre.',
  NOT_SELLER: 'Seul le vendeur peut retirer son offre.',
  EXPIRED: "L'offre a expiré.",
  NOT_EXPIRED: "L'offre n'a pas expiré.",
}

/** Délai entre deux relectures, et nombre maximal de relectures, comme pour le Classement. */
const RETRY_MS = 1_000
const MAX_READS = 10

/** Lot de ressources d'un étal : chaque ressource en grand, avec sa quantité. */
function Lot({ amounts }: { amounts: Amounts }) {
  return (
    <span className="lot">
      {Object.entries(amounts).map(([resource, amount]) => (
        <span key={resource} className="lot-item">
          <Entity kind={resource} />
          <strong>{amount}</strong>
        </span>
      ))}
    </span>
  )
}

/** Temps restant avant l'échéance d'une offre, en heures ou en minutes. */
function timeLeft(expiresAt: number) {
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`
}

/** Compte rendu d'une commande, à partir de la vue de l'offre renvoyée par l'API. */
function outcomeOf(view: OfferView): string {
  if (view.missing && view.status === 'open') {
    const missing = Object.entries(view.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Paiement refusé : il vous manque ${missing}.`
  }
  return OFFER_STATUS[view.status]
}

/** Écran du Marché : publication d'une offre, offres du joueur et offres des autres joueurs. */
export function MarketScreen() {
  const [list, setList] = useState<MarketList | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  // Formulaire de publication : une ressource cédée et une ressource demandée.
  const [give, setGive] = useState<{ resource: Resource; amount: number }>({
    resource: 'wood',
    amount: 50,
  })
  const [want, setWant] = useState<{ resource: Resource; amount: number }>({
    resource: 'stone',
    amount: 25,
  })

  // REQUÊTE : la consultation distribue la boîte d'envoi, puis rattrape la projection.
  const refresh = useCallback(async () => {
    const res = await client.offers.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setList(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : même mécanisme que le Classement (TD8), la liste est relue jusqu'à ce que
  // la projection ait atteint la position de l'événement annoncé.
  const wanted = useRef(0)
  const following = useRef(false)
  const status = useChannel(MARKET_CHANNEL, async (event) => {
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
  })

  // COMMANDES : chaque réponse contient la vue de l'offre, ou une erreur.
  async function handle(res: Response) {
    const body = (await res.json()) as { view: OfferView } | { error: { code: string } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.', error: true })
    } else {
      setMessage({ text: outcomeOf(body.view), error: body.view.status === 'rejected' })
    }
    await refresh()
  }

  const publish = async () =>
    handle(
      await client.offers.$post({
        json: { give: { [give.resource]: give.amount }, want: { [want.resource]: want.amount } },
      }),
    )
  const acceptOffer = async (id: string) =>
    handle(await client.offers[':id'].accept.$post({ param: { id } }))
  const withdrawOffer = async (id: string) =>
    handle(await client.offers[':id'].withdraw.$post({ param: { id } }))

  const mine = list?.offers.filter((offer) => offer.mine) ?? []
  const others = list?.offers.filter((offer) => !offer.mine) ?? []

  /** Sélecteur d'une ressource, par ses icônes, et de sa quantité. */
  const picker = (
    label: string,
    value: { resource: Resource; amount: number },
    onChange: (value: { resource: Resource; amount: number }) => void,
  ) => (
    <fieldset className="bargain-side">
      <legend>{label}</legend>
      <div className="resource-choice">
        {RESOURCES.map((resource) => (
          <button
            key={resource}
            type="button"
            aria-pressed={value.resource === resource}
            title={look(resource).label}
            onClick={() => onChange({ ...value, resource })}
          >
            <Entity kind={resource} />
          </button>
        ))}
      </div>
      <input
        aria-label={`Quantité : ${label}`}
        className="amount"
        type="number"
        min={1}
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
      />
      <span className="muted">{look(value.resource).label}</span>
    </fieldset>
  )

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-kicker">Place des marchands</p>
          <h1>
            <Entity kind="market" /> Marché
          </h1>
        </div>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </header>

      <section className="panel bargain" aria-label="Mettre un lot en vente">
        <h2>Mettre un lot en vente</h2>
        <div className="bargain-sides">
          {picker('Je cède', give, setGive)}
          <span className="bargain-arrow" aria-hidden="true">
            ⇄
          </span>
          {picker('Contre', want, setWant)}
        </div>
        <button type="button" className="big-button" onClick={publish}>
          <Entity kind="market" /> Publier l'offre
        </button>
        {message && (
          <p className={message.error ? 'notice error' : 'notice'} role="status">
            {message.text}
          </p>
        )}
      </section>

      <h2 className="section-title">Les étals</h2>
      {others.length === 0 && <p className="muted">Aucune offre disponible.</p>}
      <section className="stalls" aria-label="Offres des autres joueurs">
        {others.map((offer, index) => (
          <motion.article
            key={offer.offerId}
            className="stall"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <p className="stall-seller">{offer.sellerName}</p>
            <div className="stall-deal">
              <Lot amounts={offer.give} />
              <span className="muted">contre</span>
              <Lot amounts={offer.want} />
            </div>
            <p className="muted">Encore {timeLeft(offer.expiresAt)}</p>
            <button type="button" onClick={() => acceptOffer(offer.offerId)}>
              Accepter
            </button>
          </motion.article>
        ))}
      </section>

      <h2 className="section-title">Vos offres</h2>
      {mine.length === 0 && <p className="muted">Aucune offre en cours.</p>}
      <section className="stalls" aria-label="Vos offres">
        {mine.map((offer) => (
          <article key={offer.offerId} className="stall" data-mine="true">
            <p className="stall-seller">{OFFER_STATUS[offer.status]}</p>
            <div className="stall-deal">
              <Lot amounts={offer.give} />
              <span className="muted">contre</span>
              <Lot amounts={offer.want} />
            </div>
            <p className="muted">Encore {timeLeft(offer.expiresAt)}</p>
            {offer.status === 'open' && (
              <button type="button" onClick={() => withdrawOffer(offer.offerId)}>
                Retirer
              </button>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
