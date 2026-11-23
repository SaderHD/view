import { useEffect, useState } from 'react'
import { signOut } from '../auth/msal'
import { Icon, Sheet } from '../components/Sheet'
import { runConnectionCheck, type CheckResult, type ConnectionReport } from '../graph/connectionCheck'
import { clearCache } from '../storage/eventCache'

export function SettingsSheet({
  name,
  username,
  onClose,
  onOpenHours,
}: {
  name: string
  username: string
  onClose: () => void
  onOpenHours: () => void
}) {
  const [report, setReport] = useState<ConnectionReport | null>(null)
  const [running, setRunning] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    runConnectionCheck()
      .then(setReport)
      .finally(() => setRunning(false))
  }, [])

  async function recheck() {
    setRunning(true)
    try {
      setReport(await runConnectionCheck())
    } finally {
      setRunning(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    await clearCache() // don't leave your calendar on the phone after signing out
    await signOut()
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="mb-5 rounded-xl border border-line p-3">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted">{username}</p>
      </section>

      <button
        type="button"
        onClick={onOpenHours}
        className="mb-5 flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left active:bg-surface-2"
      >
        <Icon name="clock" className="h-5 w-5 text-brand" />
        <span className="flex-1">
          <span className="block font-medium">Work hours & scheduling</span>
          <span className="block text-sm text-muted">Your hours week by week, buffers, limits</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 text-muted" />
      </button>

      <section className="mb-5 rounded-xl border border-line p-3">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-medium">Microsoft 365 connection</h3>
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={running}
            className="rounded-lg px-2 py-1 text-sm font-medium text-brand disabled:opacity-50"
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

      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        className="w-full rounded-xl border border-line py-3 font-medium text-danger active:bg-surface-2 disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      <p className="mt-2 text-center text-xs text-muted">Signing out also removes the saved calendar from this phone.</p>
    </Sheet>
  )
}

function CheckRow({ label, result }: { label: string; result?: CheckResult }) {
  const icon = !result ? '…' : result.ok ? '✓' : '✕'
  const tone = !result ? 'text-muted' : result.ok ? 'text-ok' : 'text-danger'
  return (
    <li className="flex gap-3 py-2.5">
      <span className={`w-5 shrink-0 text-center font-semibold ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className={`break-words text-sm ${result && !result.ok ? 'text-danger' : 'text-muted'}`}>
          {result?.detail ?? 'Checking…'}
        </p>
      </div>
    </li>
  )
}
