/* Where the source lives. `repo` is `owner/name` on GitHub, the default, or
 * the URL of the repository on any host. What the page does with it depends
 * on what the host offers: every host gets a link, a file link and a
 * releases link where it has them; a host with a public API for it gets a
 * star count. Nothing here assumes the site is hosted where the code is. */

/* GitHub's mark, the one host icon the masthead carries; every other host is
 * named in words, which needs no drawing to be right. */
export const GH_MARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`

/* `owner/name`, an https URL, or an ssh remote, to one https URL without
 * `.git` or a trailing slash. */
export const repoUrl = (repo) => {
  if (!repo) return ''
  const s = repo.trim()
  const ssh = s.match(/^(?:ssh:\/\/)?[\w.-]+@([\w.-]+)[:/](.+?)(?:\.git)?\/?$/)
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  const bare = (x) => x.replace(/\/+$/, '').replace(/\.git$/, '')
  if (/^https?:\/\//.test(s)) return bare(s)
  return `https://github.com/${bare(s)}`
}

/* What a host is and what it offers. Forgejo and Gitea answer the same API,
 * so Codeberg and any host that names either is one kind. */
export function forgeOf(repo) {
  const url = repoUrl(repo)
  if (!url) return null
  const { host, pathname } = new URL(url)
  const path = pathname.replace(/^\/+/, '')
  const base = `https://${host}`
  if (host === 'github.com') {
    return {
      kind: 'github', url, host, path,
      api: `https://api.github.com/repos/${path}`, field: 'stargazers_count',
      file: (f) => `${url}/blob/main/${f}`, releases: `${url}/releases`,
    }
  }
  if (host === 'gitlab.com' || /(^|\.)gitlab\./.test(host)) {
    return {
      kind: 'gitlab', url, host, path,
      api: `${base}/api/v4/projects/${encodeURIComponent(path)}`, field: 'star_count',
      file: (f) => `${url}/-/blob/main/${f}`, releases: `${url}/-/releases`,
    }
  }
  if (host === 'codeberg.org' || /(^|\.)(gitea|forgejo)\./.test(host)) {
    return {
      kind: 'gitea', url, host, path,
      api: `${base}/api/v1/repos/${path}`, field: 'stars_count',
      file: (f) => `${url}/src/branch/main/${f}`, releases: `${url}/releases`,
    }
  }
  return { kind: 'other', url, host, path, api: '', field: '', file: () => url, releases: '' }
}
