import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build, parseChangelog, parseManual } from '../src/build.mjs'
import { loadConfig, validate } from '../src/config.mjs'
import { readStarCount } from '../src/stars.mjs'

const site = new URL('./fixture/', import.meta.url).pathname
const read = (out, p) => readFile(path.join(out, p), 'utf8')

test('a fixture manual renders into every output inkcap promises', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'inkcap-'))
  try {
    const config = { ...(await loadConfig(path.join(site, 'inkcap.config.mjs'))), out }
    const r = await build(config, { site })
    assert.equal(r.sections, 6)
    assert.equal(r.disclosures, 2)
    assert.equal(r.version, 'v1.2.3')
    assert.equal(r.changelog, true)

    const html = await read(out, 'index.html')
    assert.match(html, /<title>fixture — a manual to test inkcap with<\/title>/)
    assert.match(html, /<meta name="description" content="A small tool that exists so inkcap can be tested\. It does one thing, and does it with --json\.">/)
    assert.match(html, /<link rel="canonical" href="https:\/\/fixture\.example\/">/, 'trailing slash on url is stripped')
    assert.match(html, /<meta property="og:image" content="https:\/\/fixture\.example\/og\.png">/)
    assert.match(html, /--accent-light: #0B6A72;/)
    assert.match(html, /--term-key: #8FC9CE;/)
    assert.doesNotMatch(html, /#34558C/, 'no site colour is baked into the shared stylesheet')

    const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(ids, ['overview', 'install', 'exit-status', 'research-playbook', 'for-agents', 'notes'])
    assert.equal((html.match(/class="copyblock"/g) || []).length, 2, 'both titled blocks before the first ## sit in the hero')
    assert.match(html, /<p class="lede">A small tool/)
    assert.match(html, /<p class="sub">For people/)
    assert.match(html, /<a class="ver" href="\/changelog\/">v1\.2\.3<\/a>/)
    assert.match(html, /<a class="gh" href="https:\/\/github\.com\/1broseidon\/fixture">/, 'repo accepts a full GitHub URL')
    assert.match(html, /<summary>Homebrew <span class="sm">macOS and Linux<\/span><\/summary>/)
    assert.match(html, /<td class="num s-crit"><span class="status">4<\/span><\/td>/)
    assert.match(html, /<td class="cmd">ask<\/td>/)
    assert.match(html, /<span class="wn">→ exit 4: \[upstream\] rate limited<\/span>/)
    assert.match(html, /<span class="dim">→ 5 results<\/span>/)
    assert.match(html, /<span class="tag bad">Bad<\/span>/)
    assert.equal((html.match(/class="pair"/g) || []).length, 2)
    assert.match(html, /<pre><code>backend: auto\nlimit: 5<\/code><\/pre>/, 'yaml stays plain')
    assert.match(html, /<div class="callout">/)
    assert.match(html, /const moved = {"#what":"#overview"}/)
    assert.match(html, /data-copy="curl -fsSL https:\/\/fixture\.example\/install \| sh"/, 'copy text drops the prompt')
    assert.match(html, /<span>Built for the test suite<\/span>/)
    assert.match(html, /<span><a href="https:\/\/github\.com\/1broseidon\/inkcap">Published with inkcap<\/a><\/span>/)
    assert.match(html, /<meta name="generator" content="inkcap \d+\.\d+\.\d+">/)

    const llms = await read(out, 'llms.txt')
    assert.match(llms, /^# fixture\n\n> A small tool/)
    assert.match(llms, /- Exit status: https:\/\/fixture\.example\/#exit-status/)
    assert.match(llms, /- Extra: https:\/\/fixture\.example\/extra\.txt\n$/)
    assert.equal(await read(out, 'llms-full.txt'), await readFile(path.join(site, 'MANUAL.md'), 'utf8'))

    const nf = await read(out, '404.html')
    assert.match(nf, /<meta name="robots" content="noindex">/)
    assert.match(nf, /const moved = {"\/quick-start":"\/#install"}/)
    assert.match(nf, /The schemas have not moved\./)
    assert.equal(await read(out, '_redirects'), '/old   /#install   301\n')

    const cl = await read(out, 'changelog/index.html')
    assert.match(cl, /<section id="1\.2\.3">\s*<h2>1\.2\.3 — 2026-09-20<\/h2>/)
    assert.match(cl, /<section id="unreleased">\s*<h2>Unreleased<\/h2>/)

    assert.match(await read(out, 'favicon.svg'), /<svg/, 'public/ is copied through')
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})

test('a manual without sections is refused', () => {
  assert.throws(() => parseManual('# lonely\n\nJust a paragraph.\n', 'lonely'), /no ## sections/)
})

test('the config loader names every missing field', () => {
  assert.throws(
    () => validate({ name: 'x', url: 'https://x', accent: { light: { accent: '#000000' } } }),
    /missing or invalid repo, tagline, built, accent\.light\.soft \(six-digit hex\), accent\.dark\.accent/,
  )
  const c = validate({
    name: 'x', url: 'https://x.sh///', repo: 'https://github.com/o/r.git', tagline: 't', built: 'b',
    accent: { light: { accent: '#000000', soft: '#111111' }, dark: { accent: '#222222', soft: '#333333' }, terminal: { prompt: '#444444', key: '#555555' } },
  })
  assert.equal(c.url, 'https://x.sh')
  assert.equal(c.repo, 'o/r')
  assert.equal(c.manual, '../MANUAL.md')
})

test('changelog headings become version ids', () => {
  const g = parseChangelog('# Changelog\n\n## [Unreleased]\n\n## [0.17.1] - 2026-09-18\n\ntext\n\n## 0.2.0\n')
  assert.deepEqual(g.map((x) => [x.id, x.label]), [
    ['unreleased', 'Unreleased'],
    ['0.17.1', '0.17.1 — 2026-09-18'],
    ['0.2.0', '0.2.0'],
  ])
})

test('stars.json reads in both shapes', () => {
  assert.equal(readStarCount({ stars: 5, updated: '2026-09-20' }, 'x'), 5)
  assert.equal(readStarCount({ x: 7 }, 'x'), 7)
  assert.equal(readStarCount(null, 'x'), undefined)
})
