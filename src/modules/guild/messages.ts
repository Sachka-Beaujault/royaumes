import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { GuildService } from './application/guild-service'
import { GUILD_TOPICS } from './contracts'
import { playerIdOf } from './domain/member'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/**
 * Gestionnaires des messages adressés à la Guilde : les réponses du Village, qui font
 * progresser la saga de changement de guilde. Comme ceux du Village et du Marché, ils ne font
 * que traduire un message en appel au service.
 */
export function createGuildHandlers(service: GuildService): Record<string, MessageHandler> {
  return {
    [GUILD_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par la Guilde : il désigne le joueur concerné.
      await service.step(playerIdOf(transferId), {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        missing,
      })
    },
  }
}
