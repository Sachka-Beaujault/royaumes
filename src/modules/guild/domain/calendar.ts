/**
 * Calendrier de la Faille : le jour de jeu, et le nom de la Faille de chaque jour.
 * Le nom d'un jour ne dépend que de sa date : il est le même pour tous les joueurs, se calcule
 * à l'avance sans rien enregistrer, et ne révèle rien du contenu de la Faille, tiré d'une
 * graine secrète propre au jour (règles 9 et 10 de la fiche de cadrage).
 */

/** Fuseau horaire du jour de jeu : une nouvelle Faille s'ouvre à minuit, heure de Paris. */
export const GAME_TIME_ZONE = 'Europe/Paris'

/** Nombre de jours suivants dont le nom de la Faille est annoncé à l'avance. */
export const PREVIEW_DAYS = 7

/** Jour de jeu, sous la forme « AAAA-MM-JJ ». */
export type DayKey = string

/** Formateur des dates en jours de jeu ; « en-CA » produit directement la forme AAAA-MM-JJ. */
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: GAME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Jour de jeu d'un instant, en millisecondes. */
export const dayOf = (at: number): DayKey => dayFormat.format(new Date(at))

/** Durée d'un jour du calendrier, en millisecondes. */
const DAY_MS = 24 * 60 * 60_000

/** Numéro d'un jour, compté depuis le 1er janvier 1970. */
const dayNumber = (day: DayKey) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)

/** Jour situé offset jours après un autre. */
export const addDays = (day: DayKey, offset: number): DayKey =>
  new Date((dayNumber(day) + offset) * DAY_MS).toISOString().slice(0, 10)

/** Compléments du nom de la Faille, parcourus d'un jour à l'autre. */
export const RIFT_EPITHETS = [
  'des Cendres',
  'du Givre',
  'des Murmures',
  "de l'Aube Rouge",
  'des Ombres',
  'du Serment',
  'des Abysses',
  "de l'Éclipse",
  'des Ronces',
  'du Tonnerre',
  'des Échos',
  'de Cristal',
  'des Brumes',
  'de la Lune Noire',
  'des Rois Oubliés',
  'du Dernier Souffle',
] as const

/**
 * Pas du parcours des compléments : premier avec leur nombre, il fait passer chaque jour à un
 * complément différent de celui de la veille, et les parcourt tous avant de revenir au premier.
 */
const EPITHET_STEP = 7

/** Nom de la Faille d'un jour. */
export function riftName(day: DayKey): string {
  const count = RIFT_EPITHETS.length
  const index = (((dayNumber(day) * EPITHET_STEP) % count) + count) % count
  return `La Faille ${RIFT_EPITHETS[index]}`
}

/** Faille du jour d'un instant, puis celles des jours suivants, annoncées à l'avance. */
export function riftCalendar(now: number): { day: DayKey; name: string }[] {
  const today = dayOf(now)
  return Array.from({ length: PREVIEW_DAYS + 1 }, (_, offset) => {
    const day = addDays(today, offset)
    return { day, name: riftName(day) }
  })
}
