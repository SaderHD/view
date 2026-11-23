import { useState } from 'react'
import { Icon } from '../components/Sheet'
import { useSettings } from '../settings/store'
import { matchName } from './names'

/**
 * Type a city. Suggests only cities you've used before (not every city in
 * the state); a city you type for the first time is remembered when the job
 * is saved.
 */
export function CityPicker({
  value,
  onChange,
  label = 'City',
  autoFocus,
}: {
  value: string
  onChange: (city: string) => void
  label?: string
  autoFocus?: boolean
}) {
  const { settings } = useSettings()
  const known = settings.cities
  const [focused, setFocused] = useState(false)
  const typed = value.trim().toLowerCase()
  const exact = typed ? known.find((c) => c.toLowerCase() === typed) : undefined
  // Only suggest while typing (or when the box is focused and empty) so the list stays short.
  const matches = known.filter((c) => (typed ? c.toLowerCase().includes(typed) : true)).slice(0, 6)
  const show = focused && !exact && matches.length > 0

  return (
    <div className="min-w-0 flex-1">
      <label className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2.5 focus-within:border-brand">
        <Icon name="pin" className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (value.trim()) onChange(matchName(value, known)) // snap to the saved spelling
          }}
          placeholder="City"
          aria-label={label}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="next"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {exact && <Icon name="check" className="h-4 w-4 shrink-0 text-ok" />}
      </label>
      {show && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="listbox" aria-label="Cities you've used">
          {matches.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault() // keep focus so the tap lands before blur
                onChange(c)
              }}
              onClick={() => onChange(c)}
              className="rounded-full bg-surface-2 px-3 py-1 text-sm active:bg-line"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One or more cities (for a job that covers several locations). */
export function CitiesInput({ cities, onChange }: { cities: string[]; onChange: (cities: string[]) => void }) {
  const list = cities.length ? cities : ['']
  return (
    <div className="space-y-2">
      {list.map((c, i) => (
        <div key={i} className="flex items-start gap-2">
          {list.length > 1 && <span className="mt-3 w-4 shrink-0 text-center text-sm font-semibold text-muted">{i + 1}</span>}
          <CityPicker
            value={c}
            label={list.length > 1 ? `City ${i + 1}` : 'City'}
            onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
          />
          {list.length > 1 && (
            <button
              type="button"
              aria-label={`Remove city ${i + 1}`}
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="mt-2 p-1.5 text-muted active:text-danger"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, ''])} className="text-sm font-medium text-brand">
        + Add another location
      </button>
    </div>
  )
}
