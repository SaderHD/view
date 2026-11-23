import { useState } from 'react'
import { Icon } from '../components/Sheet'
import { GENERAL_CLIENT } from '../jobs/types'
import { matchClient, useClients } from './clients'

/**
 * Pick an existing client (a folder under View/Clients) or type a new one.
 * New clients get their folder when the job is saved.
 */
export function ClientPicker({
  value,
  onChange,
  autoFocus,
}: {
  value: string
  onChange: (name: string) => void
  autoFocus?: boolean
}) {
  const { clients } = useClients()
  const [focused, setFocused] = useState(false)
  const typed = value.trim()
  const lower = typed.toLowerCase()
  const exact = typed ? clients.find((c) => c.name.toLowerCase() === lower) : undefined
  const matches = clients.filter((c) => !typed || c.name.toLowerCase().includes(lower)).slice(0, 8)
  const isNew = typed !== '' && !exact

  return (
    <div>
      <label className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2.5 focus-within:border-brand">
        <Icon name="person" className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (typed) onChange(matchClient(typed, clients)) // snap to existing spelling
          }}
          placeholder="Client, e.g. X Water Company"
          aria-label="Client"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {exact && <Icon name="check" className="h-4 w-4 shrink-0 text-ok" />}
      </label>

      {(focused || !typed) && matches.length > 0 && !exact && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="Your clients">
          {matches.map((c) => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={false}
              // mousedown so the choice lands before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(c.name)
              }}
              onClick={() => onChange(c.name)}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-sm active:bg-line"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <p className="mt-1 text-xs text-muted">
        {exact
          ? `Existing client · ${exact.jobCount} item${exact.jobCount === 1 ? '' : 's'} in its folder`
          : isNew
            ? `New client: a “${typed}” folder will be created`
            : clients.length
              ? 'Choose a client or type a new one'
              : `Type a client name (leave empty for “${GENERAL_CLIENT}”)`}
      </p>
    </div>
  )
}
