import { useState } from 'react'
import { addDays, dateKey, fmtDayShort } from '../calendar/time'
import { Icon, Sheet } from '../components/Sheet'
import { saveSettings, useSettings } from '../settings/store'
import {
  blocksFor,
  copyPreviousWeek,
  DAY_KEYS,
  DAY_LABELS,
  describeBlocks,
  effectiveWeek,
  isOverridden,
  normalizeBlocks,
  resetWeek,
  setDayForWeek,
  setDefaultDay,
  setWholeWeek,
  weekStart,
  type Block,
  type DayKey,
  type Settings,
} from './workHours'

type Editing = { kind: 'week'; date: Date } | { kind: 'default'; day: DayKey } | null

/** Set work hours week by week, plus the default schedule and scheduling rules. */
export function WorkHoursSheet({ initialDate, onClose }: { initialDate?: Date; onClose: () => void }) {
  const { settings, syncState } = useSettings()
  const [tab, setTab] = useState<'week' | 'default'>('week')
  const [week, setWeek] = useState(() => weekStart(initialDate ?? new Date()))
  const [editing, setEditing] = useState<Editing>(null)
  const [presetName, setPresetName] = useState<string | null>(null)

  const save = (next: Settings) => void saveSettings(next)
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const weekHasOverrides = days.some((d) => isOverridden(d, settings))
  const presetNames = Object.keys(settings.presets).sort()

  const totalHours = (blocksList: Block[][]) =>
    blocksList.flat().reduce((sum, [s, e]) => sum + (minutes(e) - minutes(s)) / 60, 0)

  return (
    <Sheet
      title="Work hours"
      onClose={onClose}
      footer={
        <p className="text-center text-xs text-muted">
          {syncState === 'saving'
            ? 'Saving to OneDrive…'
            : syncState === 'error'
              ? 'Saved on this phone. Will sync to OneDrive when online.'
              : 'Saved to OneDrive (View/view-settings.json).'}
        </p>
      }
    >
      <div className="mb-4 flex rounded-lg bg-surface-2 p-1" role="tablist">
        {(['week', 'default'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t)
              setEditing(null)
            }}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium ${tab === t ? 'bg-surface shadow-sm' : 'text-muted'}`}
          >
            {t === 'week' ? 'By week' : 'Default & rules'}
          </button>
        ))}
      </div>

      {tab === 'week' && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" aria-label="Previous week" onClick={() => setWeek((w) => addDays(w, -7))} className="rounded-full p-2 active:bg-surface-2">
              <Icon name="chevronLeft" />
            </button>
            <div className="flex-1 text-center">
              <p className="font-semibold">Week of {fmtDayShort(week)}</p>
              <p className="text-xs text-muted">
                {totalHours(days.map((d) => blocksFor(d, settings))).toFixed(1)} h
                {weekHasOverrides ? ' · custom this week' : ' · default'}
              </p>
            </div>
            <button type="button" aria-label="Next week" onClick={() => setWeek((w) => addDays(w, 7))} className="rounded-full p-2 active:bg-surface-2">
              <Icon name="chevronRight" />
            </button>
          </div>

          <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
            {days.map((d) => {
              const open = editing?.kind === 'week' && dateKey(editing.date) === dateKey(d)
              return (
                <li key={dateKey(d)}>
                  <button
                    type="button"
                    onClick={() => setEditing(open ? null : { kind: 'week', date: d })}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2"
                  >
                    <span className="w-24 shrink-0 font-medium">{d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className={`min-w-0 flex-1 text-sm ${blocksFor(d, settings).length ? '' : 'text-muted'}`}>
                      {describeBlocks(blocksFor(d, settings))}
                    </span>
                    {isOverridden(d, settings) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" title="Changed for this week" />}
                  </button>
                  {open && (
                    <DayEditor
                      blocks={blocksFor(d, settings)}
                      onChange={(blocks) => save(setDayForWeek(settings, d, blocks))}
                      note="Only changes this date. Your default schedule stays the same."
                    />
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => save(copyPreviousWeek(settings, week))} className="rounded-lg border border-line px-3 py-2 text-sm font-medium active:bg-surface-2">
              Copy last week
            </button>
            {weekHasOverrides && (
              <button type="button" onClick={() => save(resetWeek(settings, week))} className="rounded-lg border border-line px-3 py-2 text-sm font-medium active:bg-surface-2">
                Reset to default
              </button>
            )}
            {presetNames.map((name) => (
              <span key={name} className="flex items-center rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => save(setWholeWeek(settings, week, settings.presets[name]))}
                  className="py-2 pl-3 pr-1 text-sm font-medium active:bg-surface-2"
                >
                  Use “{name}”
                </button>
                <button
                  type="button"
                  aria-label={`Delete preset ${name}`}
                  onClick={() => {
                    const presets = { ...settings.presets }
                    delete presets[name]
                    save({ ...settings, presets })
                  }}
                  className="p-2 text-muted"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {presetName === null ? (
              <button type="button" onClick={() => setPresetName('')} className="rounded-lg px-3 py-2 text-sm text-brand">
                Save week as preset
              </button>
            ) : (
              <form
                className="flex w-full gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const name = presetName.trim()
                  if (!name) return
                  save({ ...settings, presets: { ...settings.presets, [name]: effectiveWeek(week, settings) } })
                  setPresetName(null)
                }}
              >
                <input
                  autoFocus
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name, e.g. Long week"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-brand"
                />
                <button type="submit" className="rounded-lg bg-brand px-3 font-medium text-white">
                  Save
                </button>
              </form>
            )}
          </div>
        </>
      )}

      {tab === 'default' && (
        <>
          <p className="mb-2 text-sm text-muted">Used for every week unless you change that week.</p>
          <ul className="mb-5 divide-y divide-line rounded-xl border border-line">
            {DAY_KEYS.map((day) => {
              const open = editing?.kind === 'default' && editing.day === day
              return (
                <li key={day}>
                  <button
                    type="button"
                    onClick={() => setEditing(open ? null : { kind: 'default', day })}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2"
                  >
                    <span className="w-24 shrink-0 font-medium">{DAY_LABELS[day]}</span>
                    <span className={`flex-1 text-sm ${settings.defaultWeek[day].length ? '' : 'text-muted'}`}>
                      {describeBlocks(settings.defaultWeek[day])}
                    </span>
                  </button>
                  {open && (
                    <DayEditor
                      blocks={settings.defaultWeek[day]}
                      onChange={(blocks) => save(setDefaultDay(settings, day, blocks))}
                      note={`Changes every ${DAY_LABELS[day]} that hasn't been customised.`}
                    />
                  )}
                </li>
              )
            })}
          </ul>

          <h3 className="mb-2 font-semibold">Scheduling rules</h3>
          <div className="space-y-3 rounded-xl border border-line p-3">
            <NumberRow
              label="Buffer around appointments"
              help="Travel / setup time kept free before and after other events"
              unit="min"
              value={settings.scheduling.bufferMinutes}
              min={0}
              max={180}
              step={15}
              onChange={(v) => save({ ...settings, scheduling: { ...settings.scheduling, bufferMinutes: v } })}
            />
            <NumberRow
              label="Max job hours per day"
              unit="h"
              value={settings.scheduling.maxJobHoursPerDay}
              min={1}
              max={16}
              step={1}
              onChange={(v) => save({ ...settings, scheduling: { ...settings.scheduling, maxJobHoursPerDay: v } })}
            />
            <NumberRow
              label="Look ahead"
              help="How far ahead to search when there's no deadline"
              unit="days"
              value={settings.scheduling.lookaheadDays}
              min={3}
              max={90}
              step={1}
              onChange={(v) => save({ ...settings, scheduling: { ...settings.scheduling, lookaheadDays: v } })}
            />
          </div>
        </>
      )}
    </Sheet>
  )
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Edit one day's blocks: start/end times, add a block (split shift), or mark off. */
function DayEditor({ blocks, onChange, note }: { blocks: Block[]; onChange: (b: Block[]) => void; note: string }) {
  const [draft, setDraft] = useState<Block[]>(blocks)
  const input = 'min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-2 outline-none focus:border-brand'

  function update(next: Block[]) {
    setDraft(next)
    const valid = next.every(([s, e]) => s && e && minutes(e) > minutes(s))
    if (valid) onChange(normalizeBlocks(next))
  }

  return (
    <div className="space-y-2 bg-surface-2/60 px-3 pb-3 pt-1">
      {draft.length === 0 && <p className="py-1 text-sm text-muted">Day off</p>}
      {draft.map(([s, e], i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="time" aria-label="Start" className={input} value={s} onChange={(ev) => update(draft.map((b, j) => (j === i ? [ev.target.value, b[1]] : b)))} />
          <span className="text-muted">–</span>
          <input type="time" aria-label="End" className={input} value={e} onChange={(ev) => update(draft.map((b, j) => (j === i ? [b[0], ev.target.value] : b)))} />
          <button type="button" aria-label="Remove block" onClick={() => update(draft.filter((_, j) => j !== i))} className="p-2 text-muted active:text-danger">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ))}
      {draft.some(([s, e]) => s && e && minutes(e) <= minutes(s)) && <p className="text-xs text-danger">End must be after start.</p>}
      <div className="flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            const last = draft[draft.length - 1]
            const start = last ? Math.min(minutes(last[1]) + 60, 22 * 60) : 7 * 60
            const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
            update([...draft, [fmt(start), fmt(Math.min(start + 4 * 60, 23 * 60 + 59))]])
          }}
          className="font-medium text-brand"
        >
          + Add hours
        </button>
        {draft.length > 0 && (
          <button type="button" onClick={() => update([])} className="text-muted">
            Mark as day off
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{note}</p>
    </div>
  )
}

function NumberRow({
  label,
  help,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  help?: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {help && <p className="text-xs text-muted">{help}</p>}
      </div>
      <div className="flex items-center rounded-lg border border-line">
        <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))} className="px-3 py-1.5 text-lg">
          −
        </button>
        <span className="w-16 text-center text-sm tabular-nums">
          {value} {unit}
        </span>
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + step))} className="px-3 py-1.5 text-lg">
          +
        </button>
      </div>
    </div>
  )
}
