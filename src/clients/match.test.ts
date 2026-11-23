import { describe, expect, it } from 'vitest'
import { GENERAL_CLIENT } from '../jobs/types'
import { safeName } from '../lib/names'
import { matchClient, normalizeClientName } from './names'

describe('client names', () => {
  const list = [{ name: 'X Water Company' }, { name: 'Smith' }]
  it('reuses an existing client regardless of case and spacing', () => {
    expect(matchClient('x water   company', list)).toBe('X Water Company')
    expect(matchClient(' SMITH ', list)).toBe('Smith')
  })
  it('keeps a new client as typed (cleaned)', () => {
    expect(matchClient('Acme: Plant #2', list)).toBe(safeName('Acme: Plant #2'))
  })
  it('falls back to General when blank', () => {
    expect(normalizeClientName('   ')).toBe(GENERAL_CLIENT)
  })
})
