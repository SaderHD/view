/**
 * Demo mode (VITE_DEMO=1): an in-memory stand-in for Microsoft Graph so the
 * app can be run and tested without a Microsoft 365 sign-in. Never used in
 * normal builds.
 */
import { addDays, startOfDay, toGraphLocal } from '../calendar/time'

interface FakeEvent {
  id: string
  subject: string
  start: Date
  end: Date
  isAllDay: boolean
  location: string
  body: string
  showAs: string
  categories: string[]
  isOrganizer: boolean
  organizer: string
  type: string
  isCancelled: boolean
}

let seq = 0
const today = startOfDay(new Date())
const at = (dayOffset: number, h: number, m = 0) => {
  const d = addDays(today, dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}
const ev = (p: Partial<FakeEvent> & Pick<FakeEvent, 'subject' | 'start' | 'end'>): FakeEvent => ({
  id: `demo-${++seq}`,
  isAllDay: false,
  location: '',
  body: '',
  showAs: 'busy',
  categories: [],
  isOrganizer: true,
  organizer: 'You',
  type: 'singleInstance',
  isCancelled: false,
  ...p,
})

const store: FakeEvent[] = [
  ev({ subject: 'Roof inspection – Smith', start: at(0, 8), end: at(0, 11), location: '412 Oak St, Springfield', categories: ['Job'], body: 'Check flashing around chimney.\nCustomer will be home after 9.' }),
  ev({ subject: 'Team stand-up', start: at(0, 12), end: at(0, 12, 30), isOrganizer: false, organizer: 'Dana Ortiz', location: 'Teams' }),
  ev({ subject: 'Gutter repair – Nguyen', start: at(0, 13, 30), end: at(0, 16), location: '88 Birch Ln', categories: ['Job'] }),
  ev({ subject: 'Materials pickup', start: at(1, 7, 30), end: at(1, 8, 15), location: 'Home Depot – Main St', showAs: 'tentative' }),
  ev({ subject: 'Deck estimate – Patel', start: at(1, 9), end: at(1, 10, 30), location: '1500 Lake Rd', categories: ['Job'] }),
  ev({ subject: 'Lunch', start: at(1, 12), end: at(1, 13), showAs: 'free' }),
  ev({ subject: 'Safety training', start: at(2, 0), end: at(3, 0), isAllDay: true, showAs: 'oof' }),
  ev({ subject: 'Siding replacement – Garcia', start: at(3, 8), end: at(3, 15), location: '22 Elm Ct', categories: ['Job'] }),
  ev({ subject: 'Weekly review', start: at(4, 15), end: at(4, 16), type: 'occurrence' }),
  ev({ subject: 'Weekly review', start: at(11, 15), end: at(11, 16), type: 'occurrence' }),
  ev({ subject: 'Window install – Brooks', start: at(-2, 9), end: at(-2, 14), location: '7 Cedar Way', categories: ['Job'] }),
  ev({ subject: 'Supplier call (cancelled)', start: at(-1, 10), end: at(-1, 10, 30), isCancelled: true }),
  ev({ subject: 'Vacation', start: at(9, 0), end: at(12, 0), isAllDay: true, showAs: 'oof' }),
  ev({ subject: 'Fence repair – Lee', start: at(6, 10), end: at(6, 13), location: '310 Pine St', categories: ['Job'] }),
  ev({ subject: 'Invoice follow-ups', start: at(5, 8), end: at(5, 9) }),
  ev({ subject: 'Kitchen walkthrough – Adams', start: at(8, 14), end: at(8, 15, 30), location: '45 Maple Ave', categories: ['Job'] }),
]

const toGraph = (e: FakeEvent, selectBody = false) => ({
  id: e.id,
  subject: e.subject,
  start: { dateTime: `${toGraphLocal(e.start)}.0000000`, timeZone: 'local' },
  end: { dateTime: `${toGraphLocal(e.end)}.0000000`, timeZone: 'local' },
  isAllDay: e.isAllDay,
  location: { displayName: e.location },
  bodyPreview: e.body.slice(0, 255),
  showAs: e.showAs,
  categories: e.categories,
  isOrganizer: e.isOrganizer,
  organizer: { emailAddress: { name: e.organizer } },
  isCancelled: e.isCancelled,
  type: e.type,
  webLink: '',
  ...(selectBody ? { body: { contentType: 'text', content: e.body } } : {}),
})

interface GraphBody {
  subject: string
  isAllDay: boolean
  start: { dateTime: string }
  end: { dateTime: string }
  location?: { displayName?: string }
  showAs?: string
  body?: { content: string }
}

const parseLocal = (s: string) => {
  const [d, t] = s.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi)
}

function apply(e: FakeEvent, b: GraphBody) {
  e.subject = b.subject
  e.isAllDay = b.isAllDay
  e.start = parseLocal(b.start.dateTime)
  e.end = parseLocal(b.end.dateTime)
  e.location = b.location?.displayName ?? ''
  e.showAs = b.showAs ?? 'busy'
  if (b.body) e.body = b.body.content
}

const delay = () => new Promise((r) => setTimeout(r, 250))

export async function handle(path: string, init: RequestInit): Promise<unknown> {
  await delay()
  if (!navigator.onLine) throw new TypeError('Failed to fetch') // behave like real fetch offline
  const url = new URL(path, 'https://graph.microsoft.com/v1.0/')
  const p = url.pathname.replace(/^\/v1\.0/, '')
  const method = (init.method ?? 'GET').toUpperCase()

  if (p === '/me') return { displayName: 'Demo User', mail: 'demo@example.com', userPrincipalName: 'demo@example.com' }
  if (p === '/me/drive') return { driveType: 'business', quota: { used: 3.2 * 1024 ** 3, total: 1024 ** 4 } }

  if (p === '/me/calendarView') {
    const s = new Date(url.searchParams.get('startDateTime')!)
    const e = new Date(url.searchParams.get('endDateTime')!)
    const value = store
      .filter((x) => x.start < e && x.end > s)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((x) => toGraph(x))
    return { value }
  }

  if (p === '/me/events' && method === 'POST') {
    const b = JSON.parse(String(init.body)) as GraphBody
    const created = ev({ subject: b.subject, start: new Date(), end: new Date() })
    apply(created, b)
    store.push(created)
    return toGraph(created)
  }

  const m = /^\/me\/events\/(.+)$/.exec(p)
  if (m) {
    const id = decodeURIComponent(m[1])
    const idx = store.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('Event not found')
    if (method === 'DELETE') {
      store.splice(idx, 1)
      return undefined
    }
    if (method === 'PATCH') {
      apply(store[idx], JSON.parse(String(init.body)) as GraphBody)
      return toGraph(store[idx])
    }
    return toGraph(store[idx], true)
  }

  throw new Error(`Demo mode: ${method} ${p} not implemented`)
}
