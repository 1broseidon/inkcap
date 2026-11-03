/* inkcap check: the repository read for what would print wrong. Titles
 * longer than the style allows, links to sections and guides that are not
 * there, images that are missing, and versions pinned behind the latest tag.
 * It reads what the build reads and writes nothing; a finding names the file
 * and line, so it can be fixed where it was written. */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { findManual } from './config.mjs'
import { parseFrontmatter, readGuides } from './guides.mjs'
import { imageSources, resolveImages } from './image.mjs'
import { fenceInfo, inline, marked, parseManual, plain } from './render.mjs'
import { exists, gitVersion } from './repo.mjs'

/* Files the build always writes, so a link to one always lands. */
const PRINTED = new Set(['/llms.txt', '/llms-full.txt', '/manifest.json', '/robots.txt', '/sitemap.xml'])
const REMOTE = /^[a-z][a-z\d+.-]*:/i

const lineOf = (text, raw) => {
  const i = raw ? text.indexOf(raw) : -1
  return i < 0 ? 1 : text.slice(0, i).split('\n').length
}
const words = (s) => plain(inline(s)).split(/\s+/).filter(Boolean).length
const semver = (s) => s?.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number) ?? null
const behind = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export async function check(c, { site, manual: named } = {}) {
  const at = (p) => path.resolve(site, p)
  const manualPath = await findManual(c, site, named)
  const root = path.dirname(manualPath)
  const publicDir = at(c.public)
  const guidesDir = c.guides ? at(c.guides) : path.join(root, 'guides')
  const changelogPath = c.changelog ? at(c.changelog) : path.join(root, 'CHANGELOG.md')
  const hasChangelog = await exists(changelogPath)
  const limit = c.titleWords === false ? 0 : (c.titleWords ?? 3)
  const version = semver(c.version ?? gitVersion(root))
  const findings = []
  const pending = []
  const add = (file, line, kind, message) => findings.push({ file, line, kind, message })

  /* Every document and the ids a link into it can land on. */
  const idsOf = (doc) => doc.anchors
  const manualText = await readFile(manualPath, 'utf8')
  const legacy = Object.keys(c.legacyAnchors ?? {}).map((k) => k.replace(/^#/, ''))
  const docs = [{
    file: manualPath, text: manualText, body: manualText, kind: 'manual',
    ids: new Set([...idsOf(parseManual(manualText, '')), ...legacy]),
  }]
  for (const g of await readGuides(guidesDir)) {
    const { data, body } = parseFrontmatter(g.text)
    docs.push({ file: g.file, text: g.text, body, kind: 'guide', slug: g.slug, title: data.title, section: data.section, ids: idsOf(parseManual(body, '', { hero: false })) })
  }
  const readme = path.join(root, 'README.md')
  if (readme !== manualPath && (await exists(readme))) {
    const text = await readFile(readme, 'utf8')
    docs.push({ file: readme, text, body: text, kind: 'readme', ids: null })
  }
  const guides = new Map(docs.filter((d) => d.kind === 'guide').map((d) => [d.slug, d]))

  for (const d of docs) {
    const dir = path.dirname(d.file)
    if (d.section && !docs[0].ids.has(d.section)) {
      add(d.file, lineOf(d.text, `section: ${d.section}`), 'link', `section: ${d.section} is not a section of the manual`)
    }
    const tokens = marked.lexer(d.body)

    /* Titles: headings, row names, copy-block labels and table heads. A
     * guide's question headings are the exception the house allows. */
    if (limit && d.kind !== 'readme') {
      const title = (text, raw) => {
        const n = words(text)
        if (n > limit) add(d.file, lineOf(d.text, raw), 'title', `"${plain(inline(text))}" is ${n} words; titles are 1 to ${limit}`)
      }
      if (d.title) title(d.title, `title: ${d.title}`)
      marked.walkTokens(tokens, (t) => {
        if (t.type === 'heading' && t.depth >= 2) {
          if (d.kind === 'guide' && /\?\s*$/.test(t.text)) return
          title(t.depth === 4 ? t.text.split(/\s+—\s+/)[0] : t.text, t.raw)
        }
        if (t.type === 'code' && fenceInfo(t.lang).title) title(fenceInfo(t.lang).title, t.raw.split('\n')[0])
        if (t.type === 'table') for (const h of t.header) if (h.text) title(h.text, t.raw.split('\n')[0])
      })
    }

    /* Links into the site and the repository. */
    marked.walkTokens(tokens, (t) => {
      if (t.type !== 'link') return
      let href = t.href
      if (c.url && href.startsWith(c.url)) href = href.slice(c.url.length) || '/'
      if (REMOTE.test(href) || href.startsWith('//')) return
      const [p, hash] = href.split('#')
      const line = lineOf(d.text, t.raw)
      const miss = (why) => add(d.file, line, 'link', `${href} ${why}`)
      if (!p) {
        if (d.ids && hash && !d.ids.has(hash)) miss('has no section or row on this page')
        return
      }
      if (!p.startsWith('/')) {
        const target = path.resolve(dir, decodeURI(p))
        pending.push(exists(target).then((ok) => ok || miss('is not a file in the repository')))
        return
      }
      if (p === '/') {
        if (hash && !docs[0].ids.has(hash)) miss('has no section or row in the manual')
        return
      }
      const guide = p.match(/^\/guides\/([^/]+?)(?:\/|\.md)?$/)
      if (guide) {
        const g = guides.get(guide[1])
        if (!g) miss('has no guide')
        else if (hash && !g.ids.has(hash)) miss('has no section in that guide')
        return
      }
      if (/^\/guides\/?$/.test(p)) return guides.size || miss('has no guides to list')
      if (/^\/changelog\/?$/.test(p)) return hasChangelog || miss('has no changelog to show')
      if (PRINTED.has(p)) return
      pending.push(exists(path.join(publicDir, p)).then((ok) => ok || miss('is not a page or a file in public/')))
    })

    /* Images. */
    const { missing } = await resolveImages(imageSources(d.body), { root, base: dir, publicDir })
    for (const src of missing) add(d.file, lineOf(d.text, src), 'image', `${src} does not exist`)

    /* Versions pinned behind the latest tag: `image:1.2.3`, `pkg@1.2.3`,
     * `--version 1.2.3`. */
    if (version) {
      for (const m of d.text.matchAll(/(?:[:@=]|--version\s+)v?(\d+\.\d+\.\d+)(?![\w.-])/g)) {
        const v = semver(m[1])
        if (behind(v, version) < 0 && v[0] === version[0]) {
          add(d.file, lineOf(d.text, m[0]), 'drift', `pins ${m[1]}; the latest tag is v${version.join('.')}`)
        }
      }
    }
  }

  await Promise.all(pending)
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return findings
}
