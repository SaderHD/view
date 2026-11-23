// Renders public/favicon.svg into the PNG icons the PWA manifest needs.
// Run: node scripts/make-icons.mjs   (uses the pre-installed Playwright/Chromium)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = fileURLToPath(new URL('..', import.meta.url))
const svg = readFileSync(`${root}public/favicon.svg`, 'utf8')
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

const targets = [
  { file: 'pwa-192.png', size: 192, maskable: false },
  { file: 'pwa-512.png', size: 512, maskable: false },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'pwa-maskable-512.png', size: 512, maskable: true },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, maskable } of targets) {
  // Maskable: full-bleed brand background, artwork inside the 80% safe zone.
  const body = maskable
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
         <rect width="64" height="64" fill="#2563eb"/>
         <g transform="translate(9.6 9.6) scale(0.7)">${inner.replace(/<rect width="64" height="64" rx="14" fill="#2563eb"\/>/, '')}</g>
       </svg>`
    : svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`)
  await page.screenshot({ path: `${root}public/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  console.log('wrote', file)
}
await browser.close()
