import Link from 'next/link'
import { Entity } from './entity'

/**
 * Expédition ouverte, dans la liste du Donjon ou de la Faille : son hôte, ses places, occupées
 * ou libres, et le bouton pour la rejoindre. Elle est partagée par les modules qui proposent
 * des expéditions.
 */
export function ExpeditionRow({
  href,
  hostName,
  heroCount,
  maxHeroes,
}: {
  href: string
  hostName: string
  heroCount: number
  maxHeroes: number
}) {
  const seats = Array.from({ length: maxHeroes }, (_, index) => ({
    key: `place-${index + 1}`,
    taken: index < heroCount,
  }))
  return (
    <li className="expedition-row">
      <span className="expedition-host">
        <Entity kind="hero" decorative /> Expédition de <strong>{hostName}</strong>
      </span>
      <span
        className="expedition-seats"
        role="img"
        aria-label={`${heroCount} héros sur ${maxHeroes}`}
      >
        {seats.map((seat) => (
          <span key={seat.key} data-taken={seat.taken} />
        ))}
      </span>
      <Link href={href} className="button">
        Rejoindre
      </Link>
    </li>
  )
}
