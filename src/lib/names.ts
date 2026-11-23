/** OneDrive doesn't allow  " * : < > ? / \ |  or trailing dots/spaces in names. */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/["*:<>?/\\|]/g, '-')
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32) // no control characters
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned.slice(0, 200) || 'Untitled'
}
