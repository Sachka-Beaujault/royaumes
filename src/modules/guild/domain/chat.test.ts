import { describe, expect, it } from 'vitest'
import { checkBody, checkRate, expiredBefore, MESSAGE_MAX_LENGTH, RATE_LIMIT } from './chat'

const T0 = Date.UTC(2026, 0, 1)

describe('Chat de guilde - validation des messages (règle 8)', () => {
  it('retire les espaces de début et de fin, et refuse un message vide', () => {
    expect(checkBody('  À la Faille !  ')).toEqual({ ok: true, body: 'À la Faille !' })
    expect(checkBody('   ')).toEqual({ ok: false, error: { code: 'EMPTY_MESSAGE' } })
  })

  it('accepte 280 caractères, et refuse un message plus long', () => {
    expect(checkBody('🐉'.repeat(MESSAGE_MAX_LENGTH)).ok).toBe(true)
    expect(checkBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH },
    })
  })
})

describe('Chat de guilde - limitation et conservation (règle 8)', () => {
  it('accepte cinq messages par période de trente secondes, et refuse le sixième', () => {
    const four = [T0, T0 + 1000, T0 + 2000, T0 + 3000]
    expect(checkRate(four, T0 + 4000)).toBeNull()
    expect(checkRate([...four, T0 + 4000], T0 + 5000)).toEqual({
      code: 'TOO_MANY_MESSAGES',
      retryAfterMs: RATE_LIMIT.windowMs - 5000,
    })
  })

  it('conserve un message trente jours', () => {
    const thirtyDays = 30 * 24 * 60 * 60_000
    expect(expiredBefore(T0 + thirtyDays)).toBe(T0)
  })
})
