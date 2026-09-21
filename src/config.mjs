/* inkcap.config.mjs is the only file that differs from one site to the next,
 * and every key in it is optional: a key sets what the build would otherwise
 * derive from the repository, or switches off something it would otherwise
 * print. This module loads it, refuses anything that would render a broken
 * page, and finds the manual. */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { exists } from './repo.mjs'

/* The default ink: what a manual is printed in when its config names no
 * accent. Dark enough to read as text, blue enough to read as chosen. */
export const INK = {
  light: { accent: '#2F3E5C', soft: '#E4E8F0' },
  dark: { accent: '#9DB0D8', soft: '#1A2130' },
  terminal: { prompt: '#7F94C4', key: '#AABBE3' },
}

export const DEFAULTS = {
  out: 'dist',
  public: 'public',
  stars: 'stars.json',
  robots: true,
  sitemap: true,
  manifest: true,
  jsonld: true,
  editions: true,
  family: { label: 'chain.sh', href: 'https://chain.sh' },
}

const HEX = /^#[0-9a-f]{6}$/i
const STRINGS = [
  'name', 'url', 'repo', 'tagline', 'built', 'license', 'language', 'manual', 'changelog',
  'guides', 'version', 'ogImage', 'redirects', 'notFoundExtra', 'out', 'public', 'stars',
]
const OBJECTS = ['accent', 'legacyAnchors', 'moved', 'captures']
const SWITCHES = ['robots', 'sitemap', 'manifest', 'jsonld', 'editions']

export function validate(raw = {}, file = 'inkcap.config.mjs') {
  if (!raw || typeof raw !== 'object') throw new Error(`${file}: expected a default export object`)
  const bad = []
  for (const k of STRINGS) {
    if (raw[k] !== undefined && (typeof raw[k] !== 'string' || !raw[k].trim())) bad.push(`${k} (a string)`)
  }
  for (const k of OBJECTS) {
    if (raw[k] !== undefined && (!raw[k] || typeof raw[k] !== 'object')) bad.push(`${k} (an object)`)
  }
  for (const k of SWITCHES) {
    if (raw[k] !== undefined && typeof raw[k] !== 'boolean') bad.push(`${k} (true or false)`)
  }
  if (raw.llmsExtra !== undefined && !Array.isArray(raw.llmsExtra)) bad.push('llmsExtra (an array of lines)')
  if (raw.family !== undefined && raw.family !== false && !(raw.family?.label && raw.family?.href)) {
    bad.push('family (false, or { label, href })')
  }
  const accent = {}
  for (const group of ['light', 'dark', 'terminal']) {
    accent[group] = { ...INK[group] }
    for (const k of Object.keys(INK[group])) {
      const v = raw.accent?.[group]?.[k]
      if (v === undefined) continue
      if (!HEX.test(v)) bad.push(`accent.${group}.${k} (six-digit hex)`)
      else accent[group][k] = v
    }
  }
  if (bad.length) throw new Error(`${file}: invalid ${bad.join(', ')}`)

  const c = { ...DEFAULTS, ...raw, accent }
  if (c.url) c.url = c.url.replace(/\/+$/, '')
  if (c.repo) {
    c.repo = c.repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/+$/, '')
  }
  return c
}

export async function loadConfig(file) {
  const mod = await import(pathToFileURL(file).href)
  return validate(mod.default ?? mod, file)
}

/* The manual: the file named on the command line, the config's `manual`, or
 * the first of ./MANUAL.md, ../MANUAL.md, ./README.md from the site
 * directory. */
export async function findManual(config, site, named) {
  if (named) return path.resolve(named)
  if (config.manual) return path.resolve(site, config.manual)
  for (const p of ['MANUAL.md', '../MANUAL.md', 'README.md']) {
    const abs = path.resolve(site, p)
    if (await exists(abs)) return abs
  }
  throw new Error(
    `no manual: looked for MANUAL.md, ../MANUAL.md and README.md from ${site}; name one with \`inkcap build <file>\``,
  )
}
