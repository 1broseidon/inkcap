#!/usr/bin/env node
/* inkcap build [manual] [--config file] [--frozen]   render the site into dist/
 * inkcap stars [--config file]                        refresh the star count
 *
 * The config is ./inkcap.config.mjs when it exists, or the file named with
 * --config; without one, the build derives everything from the repository.
 * The directory holding the config is the site directory; without a config,
 * the current directory is. */

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from '../src/build.mjs'
import { findManual, loadConfig, validate } from '../src/config.mjs'
import { gitRemote } from '../src/repo.mjs'
import { fetchStars } from '../src/stars.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const [, v] = args.splice(i, 2)
  return v
}
const has = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

const configArg = flag('--config')
const frozen = has('--frozen')
if (has('--help') || has('-h')) {
  console.log('inkcap build [manual] [--config file] [--frozen]\ninkcap stars [--config file]')
  process.exit(0)
}
const command = ['build', 'stars'].includes(args[0]) ? args.shift() : 'build'
const named = args.shift()
if (args.length) {
  console.error(`inkcap: unexpected argument ${args[0]}`)
  process.exit(2)
}

const configPath = configArg ? path.resolve(configArg) : path.resolve('inkcap.config.mjs')
let config
if (configArg || existsSync(configPath)) {
  if (!existsSync(configPath)) {
    console.error(`inkcap: no config at ${configPath}`)
    process.exit(2)
  }
  config = await loadConfig(configPath)
} else {
  config = validate({}, 'defaults')
}
const site = configArg || existsSync(configPath) ? path.dirname(configPath) : process.cwd()

const kb = (n) => `${(n / 1024).toFixed(2)} kB`

try {
  if (command === 'stars') {
    const manual = await findManual(config, site, named)
    const repo = config.repo || gitRemote(path.dirname(manual))
    if (!repo) throw new Error('no repository: set `repo` in the config or add a GitHub origin remote')
    const file = path.resolve(site, config.stars)
    const stars = await fetchStars(repo)
    await writeFile(file, JSON.stringify({ stars, updated: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
    console.log(`${path.relative(process.cwd(), file)}  ${stars} stars`)
  } else {
    const r = await build(config, { site, manual: named, frozen, log: (m) => console.log(m) })
    const rel = path.relative(process.cwd(), path.join(r.out, 'index.html'))
    const line = [
      `built ${rel}  ${kb(r.bytes)}`,
      `${r.sections} section${r.sections === 1 ? '' : 's'}`,
      `${r.disclosures} disclosure${r.disclosures === 1 ? '' : 's'}`,
      r.guides ? `${r.guides} guide${r.guides === 1 ? '' : 's'}` : '',
      r.version || 'unversioned',
    ].filter(Boolean)
    console.log(line.join('  ·  '))
    const cap = r.captures
    if (cap.blocks && !cap.skipped) {
      const where = [...new Set(cap.drift.map((d) => path.relative(process.cwd(), d.file)))].join(', ')
      if (frozen && cap.changed) {
        console.error(`captures: ${cap.changed} of ${cap.blocks} block${cap.blocks === 1 ? '' : 's'} drifted, nothing written (--frozen)`)
        for (const d of cap.drift) console.error(`  ${path.relative(process.cwd(), d.file)}:${d.line}  $ ${d.command.split('\n')[0]}`)
        process.exit(1)
      }
      console.log(
        cap.changed
          ? `captures: ${cap.ran} ran, ${cap.changed} block${cap.changed === 1 ? '' : 's'} refreshed in ${where}`
          : `captures: ${cap.ran} ran, nothing changed`,
      )
    }
    if (r.kept.length) console.log(`kept from public/: ${r.kept.join(', ')}`)
  }
} catch (e) {
  console.error(`inkcap: ${e.message}`)
  process.exit(1)
}
