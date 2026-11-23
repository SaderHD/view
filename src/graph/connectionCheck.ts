import { graph, GraphError } from './client'

export type CheckResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string }

export interface ConnectionReport {
  profile: CheckResult
  calendar: CheckResult
  onedrive: CheckResult
}

function describe(err: unknown): string {
  if (err instanceof GraphError) {
    if (err.status === 401 || err.status === 403) {
      return `Access denied (${err.code}). The permission may need admin consent — see docs/SETUP.md.`
    }
    return `${err.code}: ${err.message}`
  }
  return err instanceof Error ? err.message : String(err)
}

async function check(fn: () => Promise<string>): Promise<CheckResult> {
  try {
    return { ok: true, detail: await fn() }
  } catch (err) {
    return { ok: false, detail: describe(err) }
  }
}

/**
 * Phase 0 smoke test: proves sign-in works and that each Microsoft Graph
 * permission the app depends on has actually been granted.
 */
export async function runConnectionCheck(): Promise<ConnectionReport> {
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [profile, calendar, onedrive] = await Promise.all([
    check(async () => {
      const me = await graph<{ displayName: string; mail?: string; userPrincipalName: string }>(
        '/me?$select=displayName,mail,userPrincipalName',
      )
      return `${me.displayName} (${me.mail ?? me.userPrincipalName})`
    }),
    check(async () => {
      const params = new URLSearchParams({
        startDateTime: now.toISOString(),
        endDateTime: in7.toISOString(),
        $select: 'id',
        $top: '100',
      })
      const res = await graph<{ value: unknown[] }>(`/me/calendarView?${params}`)
      const n = res.value.length
      return `${n}${n === 100 ? '+' : ''} event${n === 1 ? '' : 's'} in the next 7 days`
    }),
    check(async () => {
      const drive = await graph<{ driveType: string; quota?: { used: number; total: number } }>(
        '/me/drive?$select=driveType,quota',
      )
      const gb = (b: number) => (b / 1024 ** 3).toFixed(1)
      const quota = drive.quota ? ` — ${gb(drive.quota.used)} GB of ${gb(drive.quota.total)} GB used` : ''
      return `OneDrive (${drive.driveType})${quota}`
    }),
  ])

  return { profile, calendar, onedrive }
}
