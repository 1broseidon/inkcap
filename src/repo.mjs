/* What the repository says about itself, read without asking: the origin
 * remote, the latest tag, when a file last changed, the licence, the
 * language. Each returns nothing rather than guessing. */

import { execFileSync } from 'node:child_process'
import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { repoUrl } from './forge.mjs'

export const exists = (p) => access(p).then(() => true, () => false)

const git = (cwd, args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/* The origin remote: `owner/name` on GitHub, the https URL of the repository
 * on any other host, or nothing for a remote that is a local path. */
export const gitRemote = (cwd) => {
  const remote = git(cwd, ['remote', 'get-url', 'origin'])
  if (!/^(https?:\/\/|ssh:\/\/|[\w.-]+@)/.test(remote)) return ''
  const u = repoUrl(remote)
  return u.startsWith('https://github.com/') ? u.slice('https://github.com/'.length) : u
}

/* Version comes from the repo's own tags, so the site can't drift from what
 * the binary reports: the latest `v1.2.3` tag, else the latest `1.2.3` one.
 * A repository that also tags its sub-packages (`ignore-0.4.34`) is not
 * versioned by them. Falls back to unversioned rather than guessing. */
export const gitVersion = (cwd) =>
  git(cwd, ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']) ||
  git(cwd, ['describe', '--tags', '--abbrev=0', '--match', '[0-9]*'])

const day = (iso) => (iso ? iso.slice(0, 10) : '')

/* The date a file last changed: its last commit, or its mtime when it is
 * not in git (a new file, or no repo at all). */
export const fileDate = async (file) => {
  const committed = day(git(path.dirname(file), ['log', '-1', '--format=%cI', '--', path.basename(file)]))
  if (committed) return committed
  try {
    return day((await stat(file)).mtime.toISOString())
  } catch {
    return ''
  }
}

const LICENSES = [
  [/MIT License/i, 'MIT'],
  [/Apache License,?\s+Version 2\.0/i, 'Apache-2.0'],
  [/ISC License/i, 'ISC'],
  [/BSD 3-Clause|Neither the name of/i, 'BSD-3-Clause'],
  [/BSD 2-Clause|Redistribution and use in source and binary forms/i, 'BSD-2-Clause'],
  [/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL-3.0'],
  [/GNU LESSER GENERAL PUBLIC LICENSE/i, 'LGPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE\s+Version 3/i, 'GPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE\s+Version 2/i, 'GPL-2.0'],
  [/Mozilla Public License,?\s+(Version )?2\.0/i, 'MPL-2.0'],
  [/This is free and unencumbered software/i, 'Unlicense'],
  [/CC0 1\.0/i, 'CC0-1.0'],
]

/* The SPDX id of the LICENSE file beside the manual, from its first lines.
 * A licence the table doesn't know prints nothing rather than the wrong name. */
export const detectLicense = async (root) => {
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING']) {
    let head
    try {
      head = (await readFile(path.join(root, f), 'utf8')).slice(0, 1200)
    } catch {
      continue
    }
    for (const [re, id] of LICENSES) if (re.test(head)) return id
    return ''
  }
  return ''
}

/* The language, from the build file at the root. A package.json is
 * TypeScript when it says so and JavaScript otherwise. */
export const detectLanguage = async (root) => {
  const has = (f) => exists(path.join(root, f))
  if (await has('go.mod')) return 'Go'
  if (await has('Cargo.toml')) return 'Rust'
  if (await has('package.json')) {
    if (await has('tsconfig.json')) return 'TypeScript'
    try {
      const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (pkg.types || pkg.typings || deps.typescript) return 'TypeScript'
    } catch {}
    return 'JavaScript'
  }
  if ((await has('pyproject.toml')) || (await has('setup.py'))) return 'Python'
  if ((await has('Gemfile')) || (await has('Rakefile'))) return 'Ruby'
  if (await has('build.zig')) return 'Zig'
  if (await has('mix.exs')) return 'Elixir'
  return ''
}
