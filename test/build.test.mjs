import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build, parseChangelog, parseManual } from '../src/build.mjs'
import { findBlocks, parseBlock } from '../src/capture.mjs'
import { INK, loadConfig, validate } from '../src/config.mjs'
import { parseFrontmatter } from '../src/guides.mjs'
import { firstSentence, plain } from '../src/render.mjs'
import { detectLicense } from '../src/repo.mjs'
import { formatStars, readStarCount } from '../src/stars.mjs'

const site = new URL('./fixture/', import.meta.url).pathname
const read = (out, p) => readFile(path.join(out, p), 'utf8')
const scratch = () => mkdtemp(path.join(tmpdir(), 'inkcap-'))

test('a fixture manual renders into every output inkcap promises', async () => {
  const out = await scratch()
  try {
    const config = { ...(await loadConfig(path.join(site, 'inkcap.config.mjs'))), out }
    const r = await build(config, { site })
    assert.equal(r.sections, 7)
    assert.equal(r.disclosures, 4)
    assert.equal(r.version, 'v1.2.3')
    assert.equal(r.changelog, true)
    assert.equal(r.guides, 2)
    assert.equal(r.questions, 2)
    assert.equal(r.captures.blocks, 0)

    const html = await read(out, 'index.html')
    assert.match(html, /<title>fixture — a manual to test inkcap with<\/title>/)
    assert.match(html, /<meta name="description" content="A small tool that exists so inkcap can be tested\. It does one thing, and does it with --json\.">/)
    assert.match(html, /<link rel="canonical" href="https:\/\/fixture\.example\/">/, 'trailing slash on url is stripped')
    assert.match(html, /<link rel="alternate" type="text\/markdown" href="\/llms-full\.txt">/)
    assert.match(html, /<meta property="og:site_name" content="fixture">/)
    assert.match(html, /<meta property="og:image" content="https:\/\/fixture\.example\/og\.png">/)
    assert.match(html, /--accent-light: #0B6A72;/)
    assert.match(html, /--term-key: #8FC9CE;/)
    assert.doesNotMatch(html, /#34558C/, 'no site colour is baked into the shared stylesheet')

    const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(ids, ['overview', 'install', 'exit-status', 'research-playbook', 'for-agents', 'questions', 'notes'])
    assert.equal((html.match(/class="copyblock"/g) || []).length, 2, 'both titled blocks before the first ## sit in the hero')
    assert.match(html, /<p class="lede">A small tool/)
    assert.match(html, /<p class="sub">For people/)
    assert.match(html, /<a class="ver" href="\/changelog\/">v1\.2\.3<\/a>/)
    assert.match(html, /<a href="\/guides\/">guides<\/a>\s*<a href="\/#install">install<\/a>/, 'the masthead links the guides when there are some')
    assert.match(html, /<a class="gh" href="https:\/\/github\.com\/1broseidon\/fixture">/, 'repo accepts a full GitHub URL')
    assert.match(html, /<details id="homebrew">\s*<summary>Homebrew <span class="sm">macOS and Linux<\/span><\/summary>/, 'a disclosure carries the slug of its name')
    assert.match(html, /<details id="does-fixture-need-a-config-file">/)
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
    assert.match(html, /<span>MIT licensed<\/span>\s*<span>Built for the test suite<\/span>/, 'the licence is read from LICENSE')
    assert.match(html, /<span><a href="https:\/\/github\.com\/1broseidon\/inkcap">Published with inkcap<\/a><\/span>/)
    assert.match(html, /<meta name="generator" content="inkcap \d+\.\d+\.\d+">/)
    assert.match(html, /fetch\('https:\/\/api\.github\.com\/repos\/1broseidon\/fixture'\)/, 'the star count refreshes in the browser')
    assert.match(html, /if \(el && el\.tagName === 'DETAILS'\) el\.open = true/, 'a link to a disclosure opens it')

    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])
    assert.equal(ld['@context'], 'https://schema.org')
    const [app, faq] = ld['@graph']
    assert.equal(app['@type'], 'SoftwareApplication')
    assert.equal(app.softwareVersion, 'v1.2.3')
    assert.equal(app.license, 'https://spdx.org/licenses/MIT.html')
    assert.equal(app.installUrl, 'https://fixture.example/#install')
    assert.deepEqual(app.sameAs, ['https://github.com/1broseidon/fixture'])
    assert.match(app.dateModified, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(faq['@type'], 'FAQPage')
    assert.deepEqual(
      faq.mainEntity.map((q) => q.name),
      ['Does fixture need a config file?', 'Can I run it offline?'],
    )
    assert.match(faq.mainEntity[0].acceptedAnswer.text, /^No\. It works before it is configured, and fixture config shows what it inferred\.$/)

    const llms = await read(out, 'llms.txt')
    assert.match(llms, /^# fixture\n\n> A small tool that exists so inkcap can be tested\. It does one thing, and does it with --json\.\n/, 'entities are decoded, not escaped')
    assert.match(llms, /\nInstall: curl -fsSL https:\/\/fixture\.example\/install \| sh\n/)
    assert.match(llms, /- \[Overview\]\(https:\/\/fixture\.example\/#overview\): Fixture answers "what is this\?" with a table and a callout\.\n/)
    assert.match(llms, /- \[Exit status\]\(https:\/\/fixture\.example\/#exit-status\)\n/, 'a paragraph ending in a colon is not a summary')
    assert.match(llms, /## Guides\n\n[^\n]*\n\n- \[Using fixture with git worktrees\]\(https:\/\/fixture\.example\/guides\/using-fixture-with-worktrees\/\): One store, one project, however many worktrees\.\n/)
    assert.match(llms, /- Site as data: https:\/\/fixture\.example\/manifest\.json\n/)
    assert.match(llms, /- Extra: https:\/\/fixture\.example\/extra\.txt\n$/)
    assert.equal(await read(out, 'llms-full.txt'), await readFile(path.join(site, 'MANUAL.md'), 'utf8'))

    const manifest = JSON.parse(await read(out, 'manifest.json'))
    assert.equal(manifest.inkcap, 1)
    assert.equal(manifest.name, 'fixture')
    assert.equal(manifest.tagline, 'a manual to test inkcap with')
    assert.equal(manifest.repo, 'https://github.com/1broseidon/fixture')
    assert.equal(manifest.version, 'v1.2.3')
    assert.equal(manifest.license, 'MIT')
    assert.equal(manifest.language, 'Go')
    assert.deepEqual(manifest.install, {
      command: 'curl -fsSL https://fixture.example/install | sh',
      page: 'https://fixture.example/#install',
      scripts: { sh: 'https://fixture.example/install' },
    })
    assert.equal(manifest.agent, 'Install fixture and configure it for me.')
    assert.equal(manifest.manual.markdown, 'https://fixture.example/llms-full.txt')
    assert.equal(manifest.changelog, 'https://fixture.example/changelog/')
    assert.equal(manifest.sections[1].summary, 'The install script picks the build for your OS.')
    assert.equal(manifest.commands, undefined, 'no Commands section, no commands key')
    assert.deepEqual(manifest.questions, ['Does fixture need a config file?', 'Can I run it offline?'])
    assert.equal(manifest.guides.length, 2)
    assert.deepEqual(manifest.guides[0], {
      slug: 'using-fixture-with-worktrees',
      title: 'Using fixture with git worktrees',
      description: 'One store, one project, however many worktrees.',
      cluster: 'Workflows',
      reviewed: '2026-09-21',
      url: 'https://fixture.example/guides/using-fixture-with-worktrees/',
      markdown: 'https://fixture.example/guides/using-fixture-with-worktrees.md',
      questions: ['Which project does a worktree belong to?', "How do I keep a worktree's store separate?"],
    })
    assert.match(manifest.guides[1].reviewed, /^\d{4}-\d{2}-\d{2}$/, 'without a reviewed date, the file date stands in')

    const robots = await read(out, 'robots.txt')
    assert.match(robots, /^# fixture — https:\/\/fixture\.example\nUser-agent: \*\nAllow: \/\n/)
    assert.match(robots, /User-agent: GPTBot\n/)
    assert.match(robots, /User-agent: ClaudeBot\n/)
    assert.match(robots, /\nSitemap: https:\/\/fixture\.example\/sitemap\.xml\n$/)

    const sitemap = await read(out, 'sitemap.xml')
    assert.deepEqual(
      [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]),
      [
        'https://fixture.example/',
        'https://fixture.example/changelog/',
        'https://fixture.example/guides/',
        'https://fixture.example/guides/using-fixture-with-worktrees/',
        'https://fixture.example/guides/what-fixture-stores/',
      ],
    )
    assert.match(sitemap, /<loc>https:\/\/fixture\.example\/guides\/using-fixture-with-worktrees\/<\/loc><lastmod>2026-09-21<\/lastmod>/)

    const guide = await read(out, 'guides/using-fixture-with-worktrees/index.html')
    assert.match(guide, /<title>Using fixture with git worktrees — fixture<\/title>/)
    assert.match(guide, /<meta property="og:type" content="article">/)
    assert.match(guide, /<link rel="canonical" href="https:\/\/fixture\.example\/guides\/using-fixture-with-worktrees\/">/)
    assert.match(guide, /<link rel="alternate" type="text\/markdown" href="\/guides\/using-fixture-with-worktrees\.md">/)
    assert.match(guide, /<h1>Using fixture with git worktrees<\/h1>/)
    assert.match(guide, /<p class="lede">One store, one project, however many worktrees\.<\/p>/)
    assert.match(guide, /<p class="sub">A guide to <a href="\/">fixture<\/a> · Reviewed 2026-09-21 · <a href="\/guides\/using-fixture-with-worktrees\.md">Markdown<\/a><\/p>/)
    assert.match(guide, /<section>\s*<p><strong>A worktree shares/, 'the opening paragraph is a section without a heading')
    assert.match(guide, /<section id="which-project-does-a-worktree-belong-to">/)
    assert.match(guide, /<li><a href="\/">Manual<\/a><\/li>\s*<li><a href="\/guides\/">Guides<\/a><\/li>/)
    assert.match(guide, /<li><a href="#which-project-does-a-worktree-belong-to">Which project does a worktree belong to\?<\/a><\/li>/)
    const gld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])
    const [article, gfaq] = gld['@graph']
    assert.equal(article['@type'], 'TechArticle')
    assert.equal(article.headline, 'Using fixture with git worktrees')
    assert.equal(article.dateModified, '2026-09-21')
    assert.equal(article.isPartOf.url, 'https://fixture.example/')
    assert.equal(gfaq.mainEntity[0].acceptedAnswer.text, "The main clone's. Run fixture status in the worktree and the project line names the clone, as the manual's status section describes.")
    assert.equal(
      await read(out, 'guides/using-fixture-with-worktrees.md'),
      await readFile(path.join(site, 'guides', 'using-fixture-with-worktrees.md'), 'utf8'),
      'the Markdown edition is the file, verbatim',
    )

    const index = await read(out, 'guides/index.html')
    assert.match(index, /<h1>Guides<\/h1>/)
    assert.match(index, /<section id="workflows">\s*<h2>Workflows<\/h2>/)
    assert.match(index, /<li><a href="\/guides\/using-fixture-with-worktrees\/">Using fixture with git worktrees<\/a> — One store, one project, however many worktrees\.<\/li>/)
    assert.match(index, /<section>\s*<ul class="plain guides">\s*<li><a href="\/guides\/what-fixture-stores\/">/, 'guides without a cluster list under no heading')

    assert.equal(await read(out, 'install'), await readFile(path.join(site, 'install.sh'), 'utf8'), 'install.sh is served at /install')
    assert.equal(await read(out, 'install.sh'), await readFile(path.join(site, 'install.sh'), 'utf8'))

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

test('a bare README with no config is a clean page', async () => {
  const dir = await scratch()
  try {
    await writeFile(
      path.join(dir, 'README.md'),
      '# lonely\n\nA tool with one paragraph and no sections. It still gets a page.\n\n- one\n- two\n',
    )
    const r = await build(validate({}), { site: dir })
    assert.equal(r.sections, 0)
    assert.equal(r.name, 'lonely')
    assert.equal(r.repo, '', 'no git, no repo')
    assert.equal(r.url, '')
    const html = await read(r.out, 'index.html')
    assert.match(html, /<title>lonely — A tool with one paragraph and no sections<\/title>/, 'a short first sentence stands in for the tagline')
    assert.match(html, /<h1>lonely<\/h1>/)
    assert.match(html, /<section>\s*<ul class="plain">\s*<li>one<\/li>/, 'what is not hero copy is an opening section')
    assert.doesNotMatch(html, /rel="canonical"/, 'no url, no canonical')
    assert.doesNotMatch(html, /class="rail"/, 'no sections, no rail')
    assert.doesNotMatch(html, /class="gh"/, 'no repo, no GitHub link')
    assert.doesNotMatch(html, /licensed/, 'no LICENSE, no licence line')
    assert.doesNotMatch(html, /rel="icon"/, 'no public/favicon.svg, no icon link')
    assert.match(html, new RegExp(`--accent-light: ${INK.light.accent};`), 'the default ink')
    assert.match(html, /<span class="spacer"><a href="https:\/\/chain\.sh">chain\.sh<\/a><\/span>/)
    assert.match(await read(r.out, 'robots.txt'), /^# lonely\nUser-agent: \*\nAllow: \/\n/)
    assert.doesNotMatch(await read(r.out, 'robots.txt'), /Sitemap:/)
    assert.equal(await readFile(path.join(r.out, 'sitemap.xml'), 'utf8').catch(() => 'absent'), 'absent')
    const manifest = JSON.parse(await read(r.out, 'manifest.json'))
    assert.equal(manifest.url, undefined)
    assert.equal(manifest.manual.markdown, '/llms-full.txt', 'links are site-relative without a url')
    assert.match(await read(r.out, 'llms.txt'), /^# lonely\n\n> A tool with one paragraph and no sections\. It still gets a page\.\n\nThe full manual, as Markdown: \/llms-full\.txt\n\n## Links\n/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a file from public/ wins over what the build would write', async () => {
  const dir = await scratch()
  try {
    await writeFile(path.join(dir, 'MANUAL.md'), '# mine\n\nA tool.\n\n## Overview\n\nText.\n')
    await mkdir(path.join(dir, 'public'))
    await writeFile(path.join(dir, 'public', 'robots.txt'), 'User-agent: *\nDisallow: /\n')
    await writeFile(path.join(dir, 'public', 'CNAME'), 'mine.example\n')
    const r = await build(validate({}), { site: dir })
    assert.deepEqual(r.kept, ['robots.txt'])
    assert.equal(await read(r.out, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
    assert.equal(r.url, 'https://mine.example', 'the url comes from public/CNAME')
    assert.match(await read(r.out, 'index.html'), /<link rel="canonical" href="https:\/\/mine\.example\/">/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const MANUAL_WITH_CAPTURE = `# fx

A stand-in tool.

## Quickstart

\`\`\`console capture
$ echo not run
this line is not touched
$ fx hello SECRET
stale output
  # not kept: a tool may print anything
→ exit 9

$ fx fail
\`\`\`

\`\`\`console
$ fx never
verbatim, not marked
\`\`\`
`

const captureSite = async () => {
  const dir = await scratch()
  await writeFile(path.join(dir, 'MANUAL.md'), MANUAL_WITH_CAPTURE)
  await mkdir(path.join(dir, 'bin'))
  await mkdir(path.join(dir, 'fixture'))
  await writeFile(path.join(dir, 'fixture', 'seed.txt'), 'seeded\n')
  const fx = path.join(dir, 'bin', 'fx')
  await writeFile(
    fx,
    '#!/bin/sh\necho "fx $* in $(basename "$PWD") home=$(basename "$HOME")"\ncat seed.txt\ncat setup.txt\n[ "$1" = fail ] && exit 3\nexit 0\n',
  )
  await chmod(fx, 0o755)
  const config = validate({
    name: 'fx',
    captures: {
      path: 'bin',
      cwd: path.join(dir, 'sandbox'),
      setup: ['echo "set up" > setup.txt'],
      masks: [['SECRET', '***']],
    },
  })
  return { dir, config }
}

test('captures run the tool in a sandbox and rewrite the manual in place', async () => {
  const { dir, config } = await captureSite()
  try {
    const r = await build(config, { site: dir })
    assert.equal(r.captures.blocks, 1)
    assert.equal(r.captures.ran, 2)
    assert.equal(r.captures.changed, 1)
    assert.equal(r.captures.drift[0].command, 'fx hello SECRET')
    const md = await readFile(path.join(dir, 'MANUAL.md'), 'utf8')
    assert.match(md, /\$ echo not run\nthis line is not touched\n\$ fx hello SECRET\nfx hello \*\*\* in sandbox home=sandbox-home\nseeded\nset up\n\n\$ fx fail\nfx fail in sandbox home=sandbox-home\nseeded\nset up\n→ exit 3\n```/)
    assert.doesNotMatch(md, /stale output|not kept|→ exit 9/, 'everything under a prompt is replaced')
    assert.match(md, /\$ fx never\nverbatim, not marked\n/, 'unmarked blocks are untouched')
    assert.match(await read(r.out, 'llms-full.txt'), /fx hello \*\*\* in sandbox/, 'the page is built from the refreshed manual')

    const again = await build(config, { site: dir })
    assert.equal(again.captures.changed, 0, 'a second run finds nothing to change')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(path.join(dir, 'sandbox'), { recursive: true, force: true })
    await rm(path.join(dir, 'sandbox-home'), { recursive: true, force: true })
  }
})

test('--frozen never writes and reports the drift', async () => {
  const { dir, config } = await captureSite()
  try {
    const r = await build(config, { site: dir, frozen: true })
    assert.equal(r.captures.changed, 1)
    assert.deepEqual(r.captures.drift.map((d) => [path.basename(d.file), d.line]), [['MANUAL.md', 7]])
    assert.equal(await readFile(path.join(dir, 'MANUAL.md'), 'utf8'), MANUAL_WITH_CAPTURE, 'the manual is untouched')
    assert.match(await read(r.out, 'llms-full.txt'), /stale output/, 'the page is built from the committed manual')
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(path.join(dir, 'sandbox'), { recursive: true, force: true })
    await rm(path.join(dir, 'sandbox-home'), { recursive: true, force: true })
  }
})

test('without the tool on PATH the committed output prints', async () => {
  const { dir, config } = await captureSite()
  try {
    const notes = []
    const r = await build({ ...config, captures: { ...config.captures, path: undefined } }, { site: dir, log: (m) => notes.push(m) })
    assert.equal(r.captures.skipped, 'fx is not on PATH')
    assert.equal(r.captures.ran, 0)
    assert.deepEqual(notes, ['captures: 1 block printed as committed, fx is not on PATH'])
    assert.equal(await readFile(path.join(dir, 'MANUAL.md'), 'utf8'), MANUAL_WITH_CAPTURE)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('capture blocks are found and split into prompts and their output', () => {
  const { blocks } = findBlocks('a\n```console capture\n$ t one \\\n    --two\nout\n```\n```console\n$ t\n```\n')
  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0], { start: 2, end: 5, body: ['$ t one \\', '    --two', 'out'] })
  const { lead, entries } = parseBlock(['lead', '$ t one \\', '    --two', 'out', '', '$ t'])
  assert.deepEqual(lead, ['lead'])
  assert.deepEqual(entries[0], { prompt: ['$ t one \\', '    --two'], command: 't one \\\n    --two', under: ['out', ''] })
  assert.deepEqual(entries[1], { prompt: ['$ t'], command: 't', under: [] })
})

test('the manual walk: opening blocks, disclosure ids, questions', () => {
  const doc = parseManual(
    '# t\n\nLede.\n\n> note\n\n## Search\n\nFind things.\n\n#### search — by name\n\nBody.\n\n#### search\n\n## Questions\n\n#### Why?\n\nBecause.\n\n#### Empty?\n',
    't',
  )
  assert.equal(doc.opening.length, 1)
  assert.equal(doc.opening[0].type, 'blockquote')
  assert.deepEqual(doc.sections.map((s) => s.id), ['search', 'questions'])
  assert.deepEqual(doc.sections[0].items.map((d) => d.id), ['search-search', 'search-search-2'], 'ids that collide take the section prefix')
  assert.equal(doc.sections[0].summary, 'Find things.')
  assert.deepEqual(doc.questions, [{ question: 'Why?', answer: 'Because.' }], 'a question without an answer is left out')
  assert.equal(parseManual('# lonely\n\nJust a paragraph.\n', 'lonely').sections.length, 0, 'a manual without sections is fine')
})

test('the config loader takes an empty config and refuses a broken one', () => {
  const empty = validate({})
  assert.equal(empty.out, 'dist')
  assert.deepEqual(empty.accent, INK)
  assert.equal(empty.robots, true)
  assert.throws(
    () => validate({ url: 3, accent: { light: { accent: 'teal' } }, family: {} }),
    /invalid url \(a string\), family \(false, or { label, href }\), accent\.light\.accent \(six-digit hex\)/,
  )
  const c = validate({
    name: 'x', url: 'https://x.sh///', repo: 'https://github.com/o/r.git', tagline: 't', built: 'b',
    accent: { light: { accent: '#000000' } },
    family: false,
  })
  assert.equal(c.url, 'https://x.sh')
  assert.equal(c.repo, 'o/r')
  assert.equal(c.accent.light.accent, '#000000')
  assert.equal(c.accent.light.soft, INK.light.soft, 'a missing accent value keeps the default')
  assert.equal(c.family, false)
})

test('changelog headings become version ids', () => {
  const g = parseChangelog('# Changelog\n\n## [Unreleased]\n\n## [0.17.1] - 2026-09-18\n\ntext\n\n## 0.2.0\n')
  assert.deepEqual(g.map((x) => [x.id, x.label]), [
    ['unreleased', 'Unreleased'],
    ['0.17.1', '0.17.1 — 2026-09-18'],
    ['0.2.0', '0.2.0'],
  ])
})

test('frontmatter, sentences, licences', async () => {
  assert.deepEqual(parseFrontmatter('---\ntitle: "A: b"\ncluster: Workflows\nempty:\n---\nbody\n'), {
    data: { title: 'A: b', cluster: 'Workflows' },
    body: 'body\n',
  })
  assert.deepEqual(parseFrontmatter('no front\n'), { data: {}, body: 'no front\n' })
  assert.equal(firstSentence('v0.2.0 is out. It works.'), 'v0.2.0 is out.')
  assert.equal(firstSentence('Does it work? Yes'), 'Does it work?')
  assert.equal(firstSentence('no end'), 'no end')
  assert.equal(plain('<p>a &quot;b&quot; &amp; <code>c</code></p>'), 'a "b" & c')
  assert.equal(await detectLicense(site), 'MIT')
  assert.equal(await detectLicense(tmpdir()), '')
})

test('star counts print the way GitHub does', () => {
  assert.equal(formatStars(599), '599')
  assert.equal(formatStars(1000), '1k')
  assert.equal(formatStars(1234), '1.2k')
  assert.equal(formatStars(12345), '12k')
})

test('stars.json reads in both shapes', () => {
  assert.equal(readStarCount({ stars: 5, updated: '2026-09-20' }, 'x'), 5)
  assert.equal(readStarCount({ x: 7 }, 'x'), 7)
  assert.equal(readStarCount(null, 'x'), undefined)
})
