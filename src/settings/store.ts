import { useEffect, useState } from 'react'
import { graph, GraphError } from '../graph/client'
import { ensureFolderPath } from '../graph/drive'
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../schedule/workHours'

/**
 * App settings (work hours, presets, scheduling rules).
 *
 * Stored in your OneDrive as View/view-settings.json so they follow you to a
 * new phone, with a copy on this device for instant start-up and offline use.
 * If a save can't reach OneDrive it is retried the next time the app starts or
 * comes back online.
 */

const FILE_PATH = 'View/view-settings.json'
const LOCAL_KEY = 'view:settings'
const DIRTY_KEY = 'view:settingsDirty'

type Listener = () => void
const listeners = new Set<Listener>()
let current: Settings = readLocal() ?? DEFAULT_SETTINGS
let loaded = false
let syncState: 'idle' | 'saving' | 'error' = 'idle'

function readLocal(): Settings | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? sanitizeSettings(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(s: Settings, dirty: boolean) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s))
    if (dirty) localStorage.setItem(DIRTY_KEY, '1')
    else localStorage.removeItem(DIRTY_KEY)
  } catch {
    /* storage unavailable */
  }
}

const isDirty = () => {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1'
  } catch {
    return false
  }
}

function emit() {
  listeners.forEach((l) => l())
}

async function fetchRemote(): Promise<Settings | null> {
  try {
    const item = await graph<{ '@microsoft.graph.downloadUrl'?: string }>(
      `/me/drive/root:/${FILE_PATH}?$select=id,@microsoft.graph.downloadUrl`,
    )
    const url = item['@microsoft.graph.downloadUrl']
    if (!url) return null
    // Pre-authorised download link: no token needed (or allowed).
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Couldn't download settings (${res.status})`)
    return sanitizeSettings(await res.json())
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null // first run
    throw err
  }
}

async function pushRemote(s: Settings) {
  const put = () =>
    graph(`/me/drive/root:/${FILE_PATH}:/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s, null, 2),
    })
  try {
    await put()
  } catch (err) {
    // First save before the View folder exists: create it and retry.
    if (!(err instanceof GraphError) || (err.status !== 404 && err.status !== 409)) throw err
    await ensureFolderPath(['View'])
    await put()
  }
}

/** Load settings from OneDrive (once per app start), or push local changes made offline. */
export async function loadSettings(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    if (isDirty()) {
      await pushRemote(current)
      writeLocal(current, false)
      return
    }
    const remote = await fetchRemote()
    if (remote) {
      current = remote
      writeLocal(current, false)
      emit()
    }
  } catch {
    loaded = false // try again later (e.g. offline)
  }
}

/** Save new settings: applies immediately, then syncs to OneDrive (batched, so quick edits = one upload). */
let pushTimer: ReturnType<typeof setTimeout> | undefined
export function saveSettings(next: Settings): void {
  current = next
  writeLocal(next, true)
  syncState = 'saving'
  emit()
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void flush(), 1200)
}

async function flush() {
  const snapshot = current
  try {
    await pushRemote(snapshot)
    if (snapshot === current) {
      writeLocal(snapshot, false)
      syncState = 'idle'
    }
  } catch {
    syncState = 'error' // kept locally; retried on next start / reconnect
  }
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (isDirty()) {
      loaded = false
      void loadSettings()
    }
  })
}

/** Remember cities used for jobs so the City box can suggest them next time. */
export function rememberCities(cities: string[]): void {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const known = new Set(current.cities.map(key))
  const added = cities.map((c) => c.trim().replace(/\s+/g, ' ')).filter((c) => c && !known.has(key(c)) && known.add(key(c)))
  if (!added.length) return
  saveSettings({ ...current, cities: [...current.cities, ...added].sort((a, b) => a.localeCompare(b)) })
}

export function getSettings(): Settings {
  return current
}

/** Live settings plus whether the last save reached OneDrive. */
export function useSettings(): { settings: Settings; syncState: typeof syncState } {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return { settings: current, syncState }
}
