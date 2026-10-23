/**
 * Étapes de la saga de changement de guilde : pour chaque événement d'un membre, les
 * demandes à adresser au Village. Le domaine décide de ces demandes ; le service les
 * traduit en messages de la boîte d'envoi.
 */
import { CHANGE_COST } from './catalog'
import { type Amounts, type MemberEvent, type MemberState, transferIdOf } from './member'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever des ressources : le Village répond, et la réponse fait progresser la saga. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas échouer, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/**
 * Demandes déclenchées par un événement. L'état reçu est celui qui suit l'application
 * de l'événement.
 */
export function requestsFor(state: MemberState, event: MemberEvent): SagaRequest[] {
  switch (event.type) {
    // 1. Demande de changement : prélèvement du prix dans le village du joueur.
    case 'ChangeRequested':
      return [
        {
          kind: 'withdraw',
          transferId: transferIdOf(state.playerId, `change-${event.data.attempt}`),
          playerId: state.playerId,
          resources: CHANGE_COST,
        },
      ]

    // Compensation : le changement est devenu impossible après le prélèvement, l'or est
    // reversé au village du joueur. Un prélèvement refusé, lui, n'a rien à compenser.
    case 'ChangeCancelled':
      return event.data.reason === 'locked'
        ? [
            {
              kind: 'deposit',
              transferId: transferIdOf(state.playerId, `refund-${event.data.attempt}`),
              playerId: state.playerId,
              resources: CHANGE_COST,
            },
          ]
        : []

    // Premier choix, changement conclu, ou participation à la Faille : rien n'est à prélever
    // ni à compenser.
    case 'GuildJoined':
    case 'GuildChanged':
    case 'RiftEntered':
    case 'RiftEntryCancelled':
      return []
  }
}
