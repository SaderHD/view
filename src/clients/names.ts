import { GENERAL_CLIENT } from '../jobs/types'
import { safeName } from '../lib/names'

/** Clean up a typed client name; blank → "General". */
export function normalizeClientName(name: string): string {
  const trimmed = name.trim()
  return trimmed ? safeName(trimmed) : GENERAL_CLIENT
}

/**
 * Use the existing client's exact spelling if the typed name matches one
 * (ignoring case and extra spaces), so "x water co" doesn't create a second folder.
 */
export function matchClient(name: string, list: { name: string }[]): string {
  const wanted = normalizeClientName(name)
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  return list.find((c) => key(c.name) === key(wanted))?.name ?? wanted
}
