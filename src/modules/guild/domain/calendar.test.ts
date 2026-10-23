import { describe, expect, it } from 'vitest'
import { addDays, dayOf, PREVIEW_DAYS, RIFT_EPITHETS, riftCalendar, riftName } from './calendar'

describe('Faille - jour de jeu', () => {
  it('change de jour à minuit, heure de Paris, et non à minuit UTC', () => {
    // 22 h 59 UTC le 22 octobre : 0 h 59 le 23 octobre à Paris (heure d'été).
    expect(dayOf(Date.UTC(2026, 9, 22, 22, 59))).toBe('2026-10-23')
    expect(dayOf(Date.UTC(2026, 9, 22, 21, 59))).toBe('2026-10-22')
    // En hiver, Paris n'a qu'une heure d'avance sur UTC.
    expect(dayOf(Date.UTC(2026, 11, 31, 23, 30))).toBe('2027-01-01')
  })

  it("compte les jours d'un mois à l'autre et d'une année à l'autre", () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('Faille - nom du jour (règle 9)', () => {
  it('ne dépend que de la date : le même jour porte toujours le même nom', () => {
    expect(riftName('2026-10-23')).toBe(riftName('2026-10-23'))
    // Deux instants du même jour de jeu, à des heures différentes, donnent le même nom.
    const morning = riftCalendar(Date.UTC(2026, 9, 23, 6, 0))[0]
    const evening = riftCalendar(Date.UTC(2026, 9, 23, 20, 0))[0]
    expect(morning).toEqual(evening)
  })

  it('change chaque jour, et parcourt tous les noms avant de revenir au premier', () => {
    const days = Array.from({ length: RIFT_EPITHETS.length }, (_, i) => addDays('2026-10-23', i))
    const names = days.map(riftName)
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1])
    expect(new Set(names).size).toBe(RIFT_EPITHETS.length)
    expect(riftName(addDays('2026-10-23', RIFT_EPITHETS.length))).toBe(names[0])
  })

  it('annonce le nom du jour et celui des sept jours suivants', () => {
    const calendar = riftCalendar(Date.UTC(2026, 9, 23, 12, 0))
    expect(calendar).toHaveLength(PREVIEW_DAYS + 1)
    expect(calendar[0].day).toBe('2026-10-23')
    expect(calendar.at(-1)?.day).toBe('2026-10-30')
    for (const { day, name } of calendar) expect(name).toBe(riftName(day))
  })
})
