/**
 * Entrée publique « serveur » du module Guilde.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import { createGuildApi } from './api'
import { createGuildService } from './application/guild-service'
import { createEventStoreMemberRepository } from './infrastructure/event-store-member-repository'
import { createGuildHandlers } from './messages'
import { createGuildPersonalData } from './personal-data'

export interface GuildModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Distribution de la boîte d'envoi, déclenchée par la Guilde après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble l'adaptateur, le service, l'API et les gestionnaires de messages. */
export function createGuildModule({ store, dispatch, clock }: GuildModuleDeps) {
  const service = createGuildService(createEventStoreMemberRepository(store), { dispatch, clock })

  return {
    api: createGuildApi(service),
    handlers: createGuildHandlers(service),
    personalData: createGuildPersonalData(store),
  }
}

export type { GuildApi } from './api'
