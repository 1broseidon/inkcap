/* The star count in the masthead is fetched once, by `inkcap stars`, and kept
 * in stars.json next to the config so the build itself never touches the
 * network. A missing token works until the anonymous rate limit does not. */

export async function fetchStars(repo, { token = process.env.GITHUB_TOKEN } = {}) {
  const headers = { 'User-Agent': 'inkcap', Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers })
  if (!res.ok) throw new Error(`GitHub API answered ${res.status} for ${repo}`)
  const { stargazers_count } = await res.json()
  if (typeof stargazers_count !== 'number') throw new Error(`no star count in the response for ${repo}`)
  return stargazers_count
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
