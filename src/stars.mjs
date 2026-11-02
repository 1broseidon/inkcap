import { forgeOf } from './forge.mjs'

/* The star count in the masthead is fetched once, by `inkcap stars`, and kept
 * in stars.json next to the config so the build itself never touches the
 * network. A missing token works until the anonymous rate limit does not. */

export async function fetchStars(repo, { token = process.env.GITHUB_TOKEN } = {}) {
  const forge = forgeOf(repo)
  if (!forge?.api) throw new Error(`${forge?.host ?? repo} has no star count inkcap knows how to read`)
  const headers = { 'User-Agent': 'inkcap', Accept: 'application/json' }
  if (token && forge.kind === 'github') headers.Authorization = `Bearer ${token}`
  const res = await fetch(forge.api, { headers })
  if (!res.ok) throw new Error(`${forge.host} answered ${res.status} for ${forge.path}`)
  const n = (await res.json())[forge.field]
  if (typeof n !== 'number') throw new Error(`no star count in the response for ${forge.path}`)
  return n
}

/* 1234 prints as 1.2k, 12345 as 12k; below a thousand the number stands. */
export const formatStars = (n) =>
  n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n)

/* stars.json is `{ "stars": 591, "updated": "2026-09-20" }`. The older
 * `{ "<name>": 591 }` shape from the sites' first builds still reads. */
export function readStarCount(json, name) {
  if (!json || typeof json !== 'object') return undefined
  if (typeof json.stars === 'number') return json.stars
  if (typeof json[name] === 'number') return json[name]
  return undefined
}
