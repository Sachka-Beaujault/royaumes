/** Vue de l'appartenance d'un joueur : ce qu'il voit de sa guilde et de sa demande en cours. */
import type { GuildId } from './catalog'
import type { Amounts, MemberState } from './member'

export interface MemberView {
  /** Guilde actuelle ; null tant que le joueur n'en a choisi aucune. */
  guild: GuildId | null
  /** Guilde demandée par un changement en attente de la réponse du Village ; null sinon. */
  pendingTo: GuildId | null
  /** Or qui manquait au joueur lors de sa dernière demande refusée ; null sinon. */
  missing: Amounts | null
}

export function toView(state: MemberState): MemberView {
  return {
    guild: state.guild,
    pendingTo: state.pending?.to ?? null,
    missing: state.lastCancel?.reason === 'refused' ? state.lastCancel.missing : null,
  }
}
