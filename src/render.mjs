/* Markdown in, components out. Everything here is a pure function of the
 * Markdown it is handed; the build in build.mjs decides what to do with it.
 *
 * MANUAL.md is plain CommonMark — nothing in it is inkcap syntax. These are the
 * conventions by which ordinary Markdown becomes the richer components:
 *
 *   # Title                 page title; the paragraphs under it become the hero
 *   ```console title="X"    before the first ##: a copy block in the hero
 *   ## Heading              a <section>, and one entry in the sticky rail
 *   ### Heading             a mono subhead
 *   #### name — note        a collapsible row; text after " — " is the muted tail
 *   > blockquote            an accent callout
 *   ```console              a terminal block: prompts tinted, comments dimmed
 *   ```console title="X"    the same, with a labelled copy bar
 *   ```console capture      the same; the build refreshes the output (capture.mjs)
 *   ```yaml / ```json       a plain block, no shell highlighting
 *   | a | b |               a table that scrolls rather than overflowing
 *   | ok: 0 | / crit: …     a status cell, tinted by severity
 *   - **Bad** … / **Good**  a contrast pair
 *
 * Read on GitHub, all of that is just a well-formed Markdown document. marked
 * runs at build time only — the page ships zero framework JavaScript.
 */

import { Marked } from 'marked'

export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

/* ---------- inline ---------- */

export const marked = new Marked({ gfm: true })

/* marked's inline pass handles emphasis, links and entities. The only thing it
 * gets wrong for this design is bare <code>, which needs the .inline class. */
export const inline = (src) =>
  marked.parseInline(src).replace(/<code>/g, '<code class="inline">')

/* Rendered inline HTML back to the sentence a person would read: tags gone,
 * entities decoded, whitespace folded. This is the text that goes into meta
 * descriptions, llms.txt and JSON-LD. */
export const plain = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/* The first sentence of a paragraph: up to the first . ! or ? that ends a
 * word. "v0.2.0 is out." keeps its dots because they are not followed by a
 * space. */
export const firstSentence = (s) => {
  const m = s.match(/^.*?[.!?](?=\s|$)/)
  return m ? m[0] : s
}

/* ---------- terminal blocks ---------- */

const SHELL = new Set(['console', 'bash', 'sh', 'shell', 'text', ''])

/* Highlighting is derived from shell shape, not from a grammar: a leading $ or
 * > is a prompt, a # run is a comment, a → line annotates the command above
 * it, a `key:` opens a frontmatter line, and quoted strings are the argument a
 * reader is most likely scanning for. Everything else stays plain. */
const highlight = (line) => {
  const prompt = line.match(/^(\s*)([$>]) (.*)$/)
  const lead = prompt ? `${prompt[1]}<span class="p">${prompt[2]}</span> ` : ''
  let body = prompt ? prompt[3] : line

  if (/^\s*#/.test(body)) return `${lead}<span class="dim">${esc(body)}</span>`
  if (/^---$/.test(body)) return `${lead}<span class="dim">---</span>`

  const arrow = body.match(/^(\s*)→ (.*)$/)
  if (arrow) {
    const tone = /^exit \d/.test(arrow[2]) ? 'wn' : 'dim'
    return `${lead}${arrow[1]}<span class="${tone}">→ ${esc(arrow[2])}</span>`
  }

  let trailing = ''
  const comment = body.match(/^(.*?)(\s+#\s.*)$/)
  if (comment) {
    body = comment[1]
    trailing = `<span class="dim">${esc(comment[2])}</span>`
  }

  let code = esc(body).replace(
    /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
    '<span class="key">$1</span>',
  )
  if (!prompt) {
    code = code.replace(/^(\s*)([\w-]+):(?=\s|$)/, '$1<span class="key">$2:</span>')
  }
  return lead + code + trailing
}

/* The commands of a console block, without the prompts — pasting a leading $
 * into a shell is the single most common way a copied install line fails. */
export const commandsOf = (text) =>
  text
    .split('\n')
    .map((l) => l.replace(/^(\s*)[$>] /, '$1'))
    .join('\n')

const terminal = (text, title) => {
  const body = text.split('\n').map(highlight).join('\n')
  const pre = `<pre><code>${body}</code></pre>`
  if (!title) return `      ${pre}`

  return `      <div class="copyblock">
        <div class="cb-head">
          <span>${esc(title)}</span>
          <button type="button" data-copy="${esc(commandsOf(text))}">Copy</button>
        </div>
        ${pre}
      </div>`
}

/* The info string after the fence: a language, then attributes. `capture` is
 * a bare word, `title="…"` a quoted value. */
export const fenceInfo = (lang = '') => ({
  lang: lang.split(/\s+/)[0] || '',
  title: lang.match(/title="([^"]+)"/)?.[1],
  capture: /(^|\s)capture(\s|$)/.test(lang),
})

/* ---------- block rendering ---------- */

const cell = (raw, first) => {
  const bare = raw.match(/^`([^`]+)`$/)
  if (bare) return `<td class="cmd">${esc(bare[1])}</td>`
  const status = raw.match(/^(ok|warn|crit):\s*(.+)$/)
  if (status) {
    return `<td class="num s-${status[1]}"><span class="status">${inline(status[2])}</span></td>`
  }
  if (/^[~≈]?\d/.test(raw)) return `<td class="num">${inline(raw)}</td>`
  return `<td${first ? '' : ' class="no"'}>${inline(raw)}</td>`
}

const table = (t) => {
  const head = t.header.map((h) => `<th>${inline(h.text)}</th>`).join('')
  const rows = t.rows
    .map(
      (r) =>
        `            <tr>${r.map((c, i) => cell(c.text, i === 0)).join('')}</tr>`,
    )
    .join('\n')
  return `      <div class="scroll">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`
}

/* A list whose every item opens with **Bad** or **Good** is a run of contrast
 * pairs; each Bad starts a new pair. */
const PAIR = /^\*\*(Bad|Good)\*\*\s*([\s\S]*)$/
const pairs = (items) => {
  const groups = []
  for (const item of items) {
    const m = item.text.match(PAIR)
    if (m[1] === 'Bad' || !groups.length) groups.push([])
    groups[groups.length - 1].push(m)
  }
  return groups
    .map(
      (g) => `      <div class="pair">
${g
  .map(
    (m) =>
      `        <div class="row"><span class="tag ${m[1].toLowerCase()}">${m[1]}</span><p class="txt">${inline(m[2])}</p></div>`,
  )
  .join('\n')}
      </div>`,
    )
    .join('\n')
}

/* `note` marks the muted, smaller paragraph style used inside disclosures. */
export const block = (tok, note) => {
  switch (tok.type) {
    case 'paragraph':
      return `      <p${note ? ' class="note"' : ''}>${inline(tok.text)}</p>`
    case 'heading':
      return `      <h${tok.depth}>${inline(tok.text)}</h${tok.depth}>`
    case 'code': {
      const { lang, title } = fenceInfo(tok.lang)
      if (!SHELL.has(lang)) return `      <pre><code>${esc(tok.text)}</code></pre>`
      return terminal(tok.text, title)
    }
    case 'table':
      return table(tok)
    case 'blockquote':
      return `      <div class="callout">
${tok.tokens.map((t) => block(t, false)).join('\n')}
      </div>`
    case 'list':
      if (tok.items.length && tok.items.every((i) => PAIR.test(i.text))) return pairs(tok.items)
      return `      <ul class="plain">
${tok.items.map((i) => `        <li>${inline(i.text)}</li>`).join('\n')}
      </ul>`
    case 'space':
      return ''
    default:
      return tok.raw ? `      ${tok.raw.trim()}` : ''
  }
}

const renderDiscs = (items) => `      <div class="discs">
${items
  .map(
    (d) => `        <details${d.id ? ` id="${d.id}"` : ''}>
          <summary>${esc(d.name)}${d.tail ? ` <span class="sm">${esc(d.tail)}</span>` : ''}</summary>
          <div class="disc-body">
${d.blocks.map((t) => block(t, t.type === 'paragraph')).join('\n')}
          </div>
        </details>`,
  )
  .join('\n')}
      </div>`

export const renderBlocks = (blocks) =>
  blocks
    .map((b) => (b.kind === 'discs' ? renderDiscs(b.items) : block(b, false)))
    .filter(Boolean)
    .join('\n')

export const renderSections = (sections) =>
  sections
    .map(
      (s) => `      <section${s.id ? ` id="${s.id}"` : ''}>${s.label ? `\n        <h2>${esc(s.label)}</h2>` : ''}
${renderBlocks(s.blocks)}
      </section>`,
    )
    .join('\n\n')

/* ---------- text of blocks, for the machine editions ---------- */

const tokenText = (tok) => {
  switch (tok.type) {
    case 'paragraph':
    case 'heading':
      return plain(inline(tok.text))
    case 'code':
      return tok.text.trim()
    case 'list':
      return tok.items.map((i) => plain(inline(i.text))).join(' ')
    case 'blockquote':
      return tok.tokens.map(tokenText).filter(Boolean).join(' ')
    case 'table':
      return ''
    default:
      return ''
  }
}

/* The one-line summary of a run of blocks: the first sentence of its first
 * paragraph. A paragraph that ends in a colon introduces the block under it
 * and is not a summary of anything. */
export const summaryOf = (blocks) => {
  for (const b of blocks) {
    if (b.type !== 'paragraph') continue
    const text = plain(inline(b.text))
    if (/:$/.test(text)) continue
    return firstSentence(text)
  }
  return ''
}

/* The whole text of a run of blocks, as one string: the answer to a question. */
export const textOf = (blocks) =>
  blocks
    .flatMap((b) => (b.kind === 'discs' ? b.items.flatMap((d) => d.blocks) : [b]))
    .map(tokenText)
    .filter(Boolean)
    .join(' ')

/* ---------- document walk ---------- */

const QUESTIONS = /^(questions|faq|frequently asked questions)$/i

/* A #### heading opens a disclosure that swallows every block after it until
 * the next heading of equal or higher rank. Consecutive disclosures are wrapped
 * in one .discs run so their rules meet.
 *
 * With `hero` (the default) the paragraphs before the first ## are the hero
 * lede and sub and the code blocks there are the hero copy blocks; anything
 * else before the first ## is an opening section. Without it, everything
 * before the first ## is the opening section — the shape of a guide, whose
 * lede comes from its frontmatter. */
export function parseManual(md, fallbackTitle, { hero = true } = {}) {
  let title = fallbackTitle
  const intro = []
  const heroBlocks = []
  const heroCode = []
  const opening = []
  const sections = []
  let current = null
  let disc = null

  const flushDisc = () => {
    if (!disc) return
    current.blocks.push({ kind: 'discs', items: disc })
    disc = null
  }

  for (const tok of marked.lexer(md)) {
    if (tok.type === 'heading' && tok.depth === 1) {
      title = tok.text
      continue
    }
    if (tok.type === 'heading' && tok.depth === 2) {
      flushDisc()
      current = { id: slug(tok.text), label: tok.text, blocks: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      if (hero && tok.type === 'paragraph') intro.push(inline(tok.text))
      else if (hero && tok.type === 'code') {
        heroBlocks.push(block(tok, false))
        heroCode.push({ ...fenceInfo(tok.lang), text: tok.text })
      } else if (tok.type !== 'space') opening.push(tok)
      continue
    }
    if (tok.type === 'heading' && tok.depth === 4) {
      const [name, tail] = tok.text.split(/\s+—\s+/)
      if (!disc) disc = []
      disc.push({ name, tail, text: tok.text, blocks: [] })
      continue
    }
    if (tok.type === 'heading' && tok.depth <= 3) flushDisc()
    if (disc) disc[disc.length - 1].blocks.push(tok)
    else current.blocks.push(tok)
  }
  flushDisc()

  /* Section ids are the heading slugs; a disclosure's id is the slug of its
   * name, prefixed by its section's id when that is already taken. */
  const taken = new Set(sections.map((s) => s.id))
  for (const s of sections) {
    s.summary = summaryOf(s.blocks)
    s.items = []
    for (const b of s.blocks) {
      if (b.kind !== 'discs') continue
      for (const d of b.items) {
        let id = slug(d.name) || 'row'
        if (taken.has(id)) id = `${s.id}-${id}`
        for (let n = 2; taken.has(id); n++) id = `${s.id}-${slug(d.name)}-${n}`
        taken.add(id)
        d.id = id
        s.items.push(d)
      }
    }
  }

  /* The Questions section is ordinary on the page; for the machine editions
   * its rows are question-and-answer pairs. */
  const questions = sections
    .filter((s) => QUESTIONS.test(s.label))
    .flatMap((s) => s.items.map((d) => ({ question: d.text, answer: textOf(d.blocks) })))
    .filter((q) => q.answer)

  return { title, intro, heroBlocks, heroCode, opening, sections, questions }
}

/* The changelog is the repo's own CHANGELOG.md, rendered with the same shell.
 * Each release heading becomes a section so the spacing matches the manual;
 * "## [0.17.1] - 2026-09-18" gets the id "0.17.1", so a release is linkable
 * as /changelog/#0.17.1 without the date. */
export function parseChangelog(src) {
  const groups = []
  let group = null
  for (const tok of marked.lexer(src)) {
    if (tok.type === 'heading' && tok.depth === 1) continue
    if (tok.type === 'heading' && tok.depth === 2) {
      const ver = tok.text.match(/^\[?(\d[\w.-]*)\]?/)
      const label = tok.text.replace(/^\[([^\]]+)\]\s*-?\s*/, '$1 — ').replace(/ — $/, '')
      group = { id: ver ? ver[1] : slug(tok.text), label, blocks: [] }
      groups.push(group)
      continue
    }
    if (group) group.blocks.push(tok)
  }
  return groups
}

/* ---------- the shell's own pieces ---------- */

export const GH_MARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`

/* The baked count from stars.json is the fallback; each visit asks GitHub for
 * the current number so the page stays live between builds. Anonymous API
 * calls are limited per visitor, not per site, and a miss changes nothing. */
export const STARS_SCRIPT = (repo) => `<script>
fetch('https://api.github.com/repos/${repo}')
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    if (!d || typeof d.stargazers_count !== 'number') return
    const gh = document.querySelector('.masthead .gh')
    let el = gh.querySelector('.stars')
    if (!el) { el = document.createElement('span'); el.className = 'stars'; gh.appendChild(el) }
    const n = d.stargazers_count
    el.textContent = n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\\.0$/, '') + 'k' : String(n)
  })
  .catch(() => {})
</script>`

/* The copy button, and the line that opens a disclosure when the address
 * points at it — a link to /#search should show search, not a closed row. */
export const PAGE_SCRIPT = `<script>
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]')
  if (!btn) return
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const original = btn.textContent
    btn.textContent = 'Copied'
    btn.dataset.copied = '1'
    setTimeout(() => {
      btn.textContent = original
      delete btn.dataset.copied
    }, 1600)
  })
})
const reveal = () => {
  if (!location.hash) return
  const el = document.getElementById(decodeURIComponent(location.hash.slice(1)))
  if (el && el.tagName === 'DETAILS') el.open = true
}
reveal()
addEventListener('hashchange', reveal)
</script>`

/* JSON for a <script type="application/ld+json">: every < becomes \\u003c so
 * nothing in the data can close the tag. */
export const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
