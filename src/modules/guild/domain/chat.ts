/**
 * Règles du chat de guilde. Comme la Taverne, le chat n'utilise pas l'Event Sourcing : ses
 * règles se réduisent à la validation d'un message et à la limitation du nombre de messages
 * d'un joueur. Seuls les membres d'une guilde y ont accès ; cette règle est appliquée par le
 * service, qui connaît la guilde du joueur.
 *
 * DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-013) : ces règles reprennent celles
 * de la Taverne (src/modules/tavern/domain/message.ts), dont le domaine est privé à son module ;
 * une évolution de l'une n'est pas reportée dans l'autre.
 */

/** Longueur maximale d'un message, en caractères. */
export const MESSAGE_MAX_LENGTH = 280

/** Durée de conservation d'un message : trente jours, en millisecondes. */
export const RETENTION_MS = 30 * 24 * 60 * 60_000

/** Instant avant lequel un message a dépassé sa durée de conservation. */
export const expiredBefore = (now: number) => now - RETENTION_MS

/** Nombre maximal de messages d'un même joueur pendant la fenêtre de limitation. */
export const RATE_LIMIT = { messages: 5, windowMs: 30_000 }

export type ChatError =
  | { code: 'NOT_A_MEMBER' }
  | { code: 'EMPTY_MESSAGE' }
  | { code: 'MESSAGE_TOO_LONG'; max: number }
  | { code: 'TOO_MANY_MESSAGES'; retryAfterMs: number }

/**
 * Vérifie le texte d'un message et le normalise : les espaces de début et de fin sont
 * retirés. Renvoie le texte normalisé, ou l'erreur.
 */
export function checkBody(
  body: string,
): { ok: true; body: string } | { ok: false; error: ChatError } {
  const trimmed = body.trim()
  if (trimmed.length === 0) return { ok: false, error: { code: 'EMPTY_MESSAGE' } }
  // La longueur est comptée en caractères, et non en unités UTF-16.
  if ([...trimmed].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH } }
  }
  return { ok: true, body: trimmed }
}

/**
 * Applique la limitation : recent contient les dates des messages du joueur publiés
 * pendant la fenêtre qui précède now. Renvoie null si le joueur peut publier,
 * sinon l'erreur, avec le délai à attendre.
 */
export function checkRate(recent: number[], now: number): ChatError | null {
  if (recent.length < RATE_LIMIT.messages) return null
  const oldest = Math.min(...recent)
  return { code: 'TOO_MANY_MESSAGES', retryAfterMs: oldest + RATE_LIMIT.windowMs - now }
}
