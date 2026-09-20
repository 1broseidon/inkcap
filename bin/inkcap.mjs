#!/usr/bin/env node
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { build } from '../src/build.mjs'
import { loadConfig } from '../src/config.mjs'
import { fetchStars } from '../src/stars.mjs'

const USAGE = `inkcap — prints a MANUAL.md as a one-page manual site

usage
  inkcap [build]        render the site into dist/
  inkcap stars          refresh stars.json from the GitHub API
  inkcap --version

options
  --config <file>       config file, default ./inkcap.config.mjs

The site directory is the one holding inkcap.config.mjs. The manual is
../MANUAL.md by default, and public/ is copied into dist/ untouched.
`

const args = process.argv.slice(2)
let command = 'build'
let configFile = 'inkcap.config.mjs'
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--help' || a === '-h') {
    process.stdout.write(USAGE)
    process.exit(0)
  } else if (a === '--version' || a === '-v') {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    console.log(`inkcap ${pkg.version}`)
    process.exit(0)
  } else if (a === '--config') {
    configFile = args[++i]
    if (!configFile) fail('--config needs a file', 2)
  } else if (a.startsWith('-')) {
    fail(`unknown option ${a}`, 2)
  } else if (['build', 'stars'].includes(a)) {
    command = a
  } else {
    fail(`unknown command ${a}`, 2)
  }
}

function fail(msg, code = 1) {
  process.stderr.write(`inkcap: ${msg}\n`)
  if (code === 2) process.stderr.write(`\n${USAGE}`)
  process.exit(code)
}

const file = path.resolve(configFile)
const site = path.dirname(file)
let config
try {
  config = await loadConfig(file)
} catch (e) {
  fail(e.code === 'ERR_MODULE_NOT_FOUND' ? `no config at ${file}` : e.message)
}

const kb = (n) => `${(n / 1024).toFixed(2)} kB`

if (command === 'build') {
  try {
    const r = await build(config, { site })
    const rel = path.relative(process.cwd(), path.join(r.out, 'index.html')) || 'index.html'
    console.log(
      `built ${rel}  ${kb(r.bytes)}  ·  ${r.sections} sections  ·  ${r.disclosures} disclosures  ·  ${r.version || 'no tag'}${r.changelog ? '  ·  changelog' : ''}`,
    )
  } catch (e) {
    fail(e.message)
  }
}

/* A failed fetch keeps whatever stars.json already holds: the count is a
 * nicety, and the build must never depend on the GitHub API being up. */
if (command === 'stars') {
  const target = path.resolve(site, config.stars)
  try {
    const stars = await fetchStars(config.repo)
    const updated = new Date().toISOString().slice(0, 10)
    await writeFile(target, JSON.stringify({ stars, updated }, null, 2) + '\n')
    console.log(`${config.repo}: ${stars} stars → ${path.relative(process.cwd(), target)}`)
  } catch (e) {
    process.stderr.write(`inkcap: stars not refreshed (${e.message}); keeping ${path.relative(process.cwd(), target)}\n`)
  }
}
