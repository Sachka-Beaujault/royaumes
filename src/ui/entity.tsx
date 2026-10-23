import { look } from './theme'

/**
 * Affiche une entité du jeu (ressource, bâtiment...) à partir du thème.
 * L'icône est masquée aux lecteurs d'écran, qui lisent le libellé à la place. Une entité
 * décorative, suivie d'un texte qui la nomme déjà (« Village », « Attaquer... »), n'a pas de
 * libellé : les lecteurs d'écran ne le liraient pas deux fois.
 */
export function Entity({
  kind,
  showLabel = false,
  decorative = false,
}: {
  kind: string
  showLabel?: boolean
  decorative?: boolean
}) {
  const { icon: Icon, label } = look(kind)
  return (
    <span className="entity" title={decorative ? undefined : label} data-kind={kind}>
      <Icon aria-hidden="true" className="entity-icon" />
      {showLabel && <span>{label}</span>}
      {!showLabel && !decorative && <span className="sr-only">{label}</span>}
    </span>
  )
}
