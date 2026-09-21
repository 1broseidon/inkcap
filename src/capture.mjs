/* Captures: console blocks the build keeps verbatim by re-running them.
 *
 *   ```console capture
 *   $ recoil wake --max-chars 1600
 *   ...what it printed last time...
 *   ```
 *
 * Every `$` line in such a block is a command. The ones whose first word is
 * the tool's name run, in document order, in one sandbox; what they print
 * replaces everything under the prompt, plus "→ exit N" when the exit status
 * was not zero — a tool may print anything, so nothing under a prompt is
 * treated as the author's; annotations belong outside the block. Any other
 * prompt — curl | sh, brew, make, cd — is printed as written and never run.
 *
 * The sandbox is a fresh directory at a fixed path with a fresh HOME beside
 * it, so paths in the output are stable and a tool that keeps state never
 * opens the author's own. Nothing runs when the tool is not on PATH, which is
 * every GitHub Pages build: the committed output prints instead. */

import { spawnSync } from 'node:child_process'
import { access, constants, cp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exists } from './repo.mjs'

const OPEN = /^(`{3,}|~{3,})\s*console\b(.*)$/
const IS_CAPTURE = (attrs) => /(^|\s)capture(\s|$)/.test(attrs)
const PROMPT = /^\$ (.*)$/

/* The capture blocks of one Markdown file: where each sits and what is in it. */
export function findBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(OPEN)
    if (!open || !IS_CAPTURE(open[2])) continue
    const fence = open[1]
    const closes = (l) => {
      const m = l.match(/^(`{3,}|~{3,})\s*$/)
      return Boolean(m && m[1][0] === fence[0] && m[1].length >= fence.length)
    }
    let j = i + 1
    while (j < lines.length && !closes(lines[j])) j++
    if (j >= lines.length) break
    blocks.push({ start: i + 1, end: j, body: lines.slice(i + 1, j) })
    i = j
  }
  return { lines, blocks }
}

/* One block's body as entries: the lines before the first prompt, then one
 * entry per prompt with the lines under it. A prompt line ending in \ runs on
 * to the next line. */
export function parseBlock(body) {
  const lead = []
  const entries = []
  let cur = null
  for (let i = 0; i < body.length; i++) {
    const line = body[i]
    const m = line.match(PROMPT)
    if (m) {
      cur = { prompt: [line], command: m[1], under: [] }
      entries.push(cur)
      while (/\\$/.test(body[i]) && i + 1 < body.length) {
        i++
        cur.prompt.push(body[i])
        cur.command += '\n' + body[i]
      }
      continue
    }
    if (cur) cur.under.push(line)
    else lead.push(line)
  }
  return { lead, entries }
}

const firstWord = (command) => command.trim().split(/\s+/)[0] ?? ''

const which = async (tool, PATH) => {
  const names = process.platform === 'win32' ? [`${tool}.exe`, `${tool}.cmd`, tool] : [tool]
  for (const dir of PATH.split(path.delimiter).filter(Boolean)) {
    for (const n of names) {
      const p = path.join(dir, n)
      if (await access(p, constants.X_OK).then(() => true, () => false)) return p
    }
  }
  return ''
}

const applyMasks = (text, masks) => {
  for (const [pattern, replacement] of masks) {
    text = typeof pattern === 'string' ? text.split(pattern).join(replacement) : text.replace(pattern, replacement)
  }
  return text
}

/* Run the captures of every file. Returns the files with their refreshed
 * text and what changed; writes nothing — the build decides that. */
export async function refreshCaptures(files, { tool, site, captures = {}, log = () => {} }) {
  const parsed = files.map((f) => ({ ...f, ...findBlocks(f.text) }))
  const blocks = parsed.reduce((n, f) => n + f.blocks.length, 0)
  const result = { blocks, ran: 0, changed: 0, drift: [], files: parsed.map((f) => ({ ...f, changed: false })) }
  if (!blocks) return result

  const env = { ...process.env }
  if (captures.path) env.PATH = `${path.resolve(site, captures.path)}${path.delimiter}${env.PATH ?? ''}`
  const bin = await which(tool, env.PATH ?? '')
  if (!bin) {
    result.skipped = `${tool} is not on PATH`
    log(`captures: ${blocks} block${blocks === 1 ? '' : 's'} printed as committed, ${tool} is not on PATH`)
    return result
  }

  const name = tool.replace(/[^\w.-]+/g, '-')
  const cwd = captures.cwd ? path.resolve(site, captures.cwd) : path.join(tmpdir(), name)
  const home = captures.home ? path.resolve(site, captures.home) : `${cwd}-home`
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    NO_COLOR: '1',
    TERM: 'dumb',
    COLUMNS: '80',
    ...captures.env,
  })
  const timeout = captures.timeout ?? 30_000
  const masks = captures.masks ?? []

  await rm(cwd, { recursive: true, force: true })
  await rm(home, { recursive: true, force: true })
  await mkdir(cwd, { recursive: true })
  await mkdir(env.XDG_CONFIG_HOME, { recursive: true })
  const fixture = path.resolve(site, captures.fixture ?? 'fixture')
  if (await exists(fixture)) await cp(fixture, cwd, { recursive: true })

  const sh = (command) => {
    const r = spawnSync('sh', ['-c', `( ${command}\n) 2>&1`], {
      cwd,
      env,
      encoding: 'utf8',
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    })
    if (r.error && r.error.code === 'ENOENT') throw new Error('captures need a POSIX sh on PATH')
    if (r.signal || r.error) throw new Error(`capture timed out after ${timeout} ms: ${command}`)
    return { out: r.stdout ?? '', code: r.status ?? 0 }
  }

  for (const command of captures.setup ?? []) {
    const { out, code } = sh(command)
    if (code !== 0) throw new Error(`capture setup failed (exit ${code}): ${command}\n${out}`)
  }

  for (const file of result.files) {
    for (const b of file.blocks) {
      const { lead, entries } = parseBlock(b.body)
      const fresh = [...lead]
      entries.forEach((e, i) => {
        fresh.push(...e.prompt)
        if (firstWord(e.command) !== tool) {
          fresh.push(...e.under)
          return
        }
        result.ran++
        const { out, code } = sh(e.command)
        const lines = applyMasks(out, masks)
          .split('\n')
          .map((l) => l.replace(/\s+$/, ''))
        while (lines.length && !lines[lines.length - 1]) lines.pop()
        if (code !== 0) lines.push(`→ exit ${code}`)
        let gap = 0
        for (let k = e.under.length - 1; k >= 0 && !e.under[k].trim(); k--) gap++
        if (i === entries.length - 1) gap = 0
        fresh.push(...lines, ...Array(gap).fill(''))
      })
      if (fresh.join('\n') !== b.body.join('\n')) {
        b.fresh = fresh
        file.changed = true
        result.changed++
        result.drift.push({ file: file.path, line: b.start, command: entries.find((e) => firstWord(e.command) === tool)?.command ?? '' })
      }
    }
    if (file.changed) {
      const lines = [...file.lines]
      for (const b of [...file.blocks].reverse()) if (b.fresh) lines.splice(b.start, b.end - b.start, ...b.fresh)
      file.text = lines.join('\n')
    }
  }
  return result
}
