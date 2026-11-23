import { useCallback, useEffect, useState } from 'react'
import { signOut } from '../auth/msal'
import { runConnectionCheck, type CheckResult, type ConnectionReport } from '../graph/connectionCheck'
import { Logo } from './Logo'

/**
 * Phase 0 home screen. Confirms you're signed in and that the app can reach
 * your profile, Outlook calendar and OneDrive. Replaced by the calendar in
 * Phase 1.
 */
export function HomeScreen({ name, username }: { name: string; username: string }) {
  const [report, setReport] = useState<ConnectionReport | null>(null)
  const [running, setRunning] = useState(true)

  const run = useCallback(async () => {
    setRunning(true)
    try {
      setReport(await runConnectionCheck())
    } finally {
      setRunning(false)
    }
  }, [])

  // Run once on open.
  useEffect(() => {
    runConnectionCheck()
      .then(setReport)
      .finally(() => setRunning(false))
  }, [])

  const allOk = report && report.profile.ok && report.calendar.ok && report.onedrive.ok

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pb-8 pt-[max(env(safe-area-inset-top),1.5rem)]">
      <header className="flex items-center gap-3">
        <Logo size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-sm text-muted">{username}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg px-3 py-2 text-sm text-muted active:bg-surface-2"
        >
          Sign out
        </button>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Microsoft 365 connection</h2>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand active:bg-surface-2 disabled:opacity-50"
          >
            {running ? 'Checking…' : 'Re-check'}
          </button>
        </div>
        <ul className="divide-y divide-line">
          <CheckRow label="Profile" result={report?.profile} />
          <CheckRow label="Outlook calendar" result={report?.calendar} />
          <CheckRow label="OneDrive" result={report?.onedrive} />
        </ul>
      </section>

      {allOk && (
        <p className="rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">
          Everything's connected. Phase 0 is done; the calendar comes in Phase 1.
        </p>
      )}
    </main>
  )
}

function CheckRow({ label, result }: { label: string; result?: CheckResult }) {
  const icon = !result ? '…' : result.ok ? '✓' : '✕'
  const tone = !result ? 'text-muted' : result.ok ? 'text-ok' : 'text-danger'
  return (
    <li className="flex gap-3 py-3">
      <span className={`w-5 shrink-0 text-center font-semibold ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className={`break-words text-sm ${result && !result.ok ? 'text-danger' : 'text-muted'}`}>
          {result?.detail ?? 'Checking…'}
        </p>
      </div>
    </li>
  )
}
