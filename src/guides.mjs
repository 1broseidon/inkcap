/* Guides: one Markdown file each, beside the manual, with a little
 * frontmatter. The knowledge base is deliberately this light — no tags, no
 * nesting, no search. A guide answers one question and links to the manual
 * for the rest. */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { inline, parseManual, plain, textOf } from './render.mjs'
import { fileDate } from './repo.mjs'

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/* `key: value` lines only. Quotes around a value are dropped; nothing is
 * nested; anything else is left to the body. */
export function parseFrontmatter(src) {
  const m = src.match(FRONT)
  if (!m) return { data: {}, body: src }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (!kv) continue
    let v = kv[2].trim()
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
    if (v) data[kv[1]] = v
  }
  return { data, body: src.slice(m[0].length) }
}

/* Every *.md in the directory, in name order; the file's stem is the slug. */
export async function readGuides(dir) {
  let names
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort()
  } catch {
    return []
  }
  const guides = []
  for (const n of names) {
    const file = path.join(dir, n)
    guides.push({ slug: n.replace(/\.md$/, ''), file, text: await readFile(file, 'utf8') })
  }
  return guides
}

const firstParagraph = (blocks) => {
  const p = blocks.find((b) => b.type === 'paragraph')
  return p ? plain(inline(p.text)) : ''
}

/* A guide's facts and parsed body. The title and description come from the
 * frontmatter, else from the body's # heading and first paragraph; the
 * reviewed date from the frontmatter, else from the file's last commit. A
 * question-shaped ## heading is a FAQ entry whose answer is its first
 * paragraph. */
export async function parseGuide(g) {
  const { data, body } = parseFrontmatter(g.text)
  const doc = parseManual(body, data.title ?? g.slug, { hero: false })
  const description = data.description ?? firstParagraph(doc.opening)
  const questions = doc.sections
    .filter((s) => /\?\s*$/.test(s.label))
    .map((s) => ({ question: s.label, answer: firstParagraph(s.blocks) || textOf(s.blocks) }))
    .filter((q) => q.answer)
  return {
    slug: g.slug,
    file: g.file,
    text: g.text,
    title: doc.title,
    description,
    cluster: data.cluster ?? '',
    reviewed: data.reviewed ?? (await fileDate(g.file)),
    opening: doc.opening,
    sections: doc.sections,
    questions,
  }
}
