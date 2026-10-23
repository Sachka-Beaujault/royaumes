import { look } from './theme'

/**
 * Affiche une entité du jeu (ressource, bâtiment...) à partir du thème.
 * L'icône est masquée aux lecteurs d'écran, qui lisent le libellé à la place.
 */
export function Entity({ kind, showLabel = false }: { kind: string; showLabel?: boolean }) {
  const { icon: Icon, label } = look(kind)
  return (
    <span className="entity" title={label} data-kind={kind}>
      <Icon aria-hidden="true" className="entity-icon" />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
