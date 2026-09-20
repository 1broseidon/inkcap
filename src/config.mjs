/* inkcap.config.mjs is the only file that differs from one site to the next.
 * This module loads it and refuses anything that would render a broken page. */

import { pathToFileURL } from 'node:url'

export const DEFAULTS = {
  manual: '../MANUAL.md',
  out: 'dist',
  public: 'public',
  stars: 'stars.json',
}

const HEX = /^#[0-9a-f]{6}$/i
const ACCENT = [
  ['light', ['accent', 'soft']],
  ['dark', ['accent', 'soft']],
  ['terminal', ['prompt', 'key']],
]

export function validate(raw, file = 'inkcap.config.mjs') {
  if (!raw || typeof raw !== 'object') throw new Error(`${file}: expected a default export object`)
  const missing = []
  for (const k of ['name', 'url', 'repo', 'tagline', 'built']) {
    if (typeof raw[k] !== 'string' || !raw[k].trim()) missing.push(k)
  }
  for (const [group, keys] of ACCENT) {
    for (const k of keys) {
      if (!HEX.test(raw.accent?.[group]?.[k] ?? '')) missing.push(`accent.${group}.${k} (six-digit hex)`)
    }
  }
  if (missing.length) throw new Error(`${file}: missing or invalid ${missing.join(', ')}`)

  return {
    ...DEFAULTS,
    ...raw,
    url: raw.url.replace(/\/+$/, ''),
    repo: raw.repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/+$/, ''),
  }
}

export async function loadConfig(file) {
  const mod = await import(pathToFileURL(file).href)
  return validate(mod.default ?? mod, file)
}
