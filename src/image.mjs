/* Images in the manual. A Markdown image is a path relative to the manual, so
 * it shows on GitHub as written; the build copies the file to the same path
 * on the site, reads its size so the page never jumps while it loads, and
 * pairs it with a phone crop when one sits beside it (`desk.webp` and
 * `desk.phone.webp`). Nothing here decodes pixels: the size comes from the
 * file's header, which every format the web shows puts in its first bytes. */

import { open, readFile } from 'node:fs/promises'
import path from 'node:path'
import { exists } from './repo.mjs'
import { marked } from './render.mjs'

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

/* Width and height from the header, or null for a format it does not know. */
export function imageSize(buf, ext = '') {
  if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16)
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }
    }
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    /* JPEG: walk the markers to the first start-of-frame. */
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
      }
      i += 2 + len
    }
    return null
  }
  if (ext === '.svg') {
    const head = buf.toString('utf8')
    const w = head.match(/<svg[^>]*\swidth="([\d.]+)(?:px)?"/)?.[1]
    const h = head.match(/<svg[^>]*\sheight="([\d.]+)(?:px)?"/)?.[1]
    if (w && h) return { width: Math.round(+w), height: Math.round(+h) }
    const box = head.match(/<svg[^>]*\sviewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/)
    if (box) return { width: Math.round(+box[1]), height: Math.round(+box[2]) }
  }
  return null
}

/* JPEG frames can sit past the first kilobytes; 256 KiB covers every real
 * header. SVG is text and small; it is read whole. */
const readHead = async (file) => {
  if (path.extname(file).toLowerCase() === '.svg') return readFile(file)
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(256 * 1024)
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

/* Every image source in a run of Markdown, in document order: Markdown
 * images, and the src of each <img> written as HTML. */
export function imageSources(md) {
  const found = []
  const add = (src) => src && !found.includes(src) && found.push(src)
  marked.walkTokens(marked.lexer(md), (t) => {
    if (t.type === 'image') add(t.href)
    if (t.type === 'html') for (const m of t.raw.matchAll(/<img\b[^>]*?\ssrc=(["'])([^"']+)\1/gi)) add(m[2])
  })
  return found
}

const phoneOf = (file) => {
  const ext = path.extname(file)
  return `${file.slice(0, -ext.length)}.phone${ext}`
}

const urlOf = (rel) => `/${rel.split(path.sep).map(encodeURIComponent).join('/')}`

/* Resolve each source to what the page needs: its URL on the site, its size,
 * its phone crop, and the files to copy. A source is looked for relative to
 * the file it is written in (`base`: the manual's folder, or guides/) first,
 * as GitHub reads it; a path that lands inside public/ is served from where
 * public/ puts it, anything else at its path from the repository root. A file
 * that is missing is left as written, and named in `missing`. */
export async function resolveImages(sources, { root, base = root, publicDir }) {
  const map = new Map()
  const copies = []
  const missing = []
  for (const src of sources) {
    if (REMOTE.test(src)) continue
    const clean = decodeURI(src.split(/[?#]/)[0])
    const candidates = clean.startsWith('/')
      ? [path.join(publicDir, clean), path.join(root, clean)]
      : [path.resolve(base, clean), path.resolve(publicDir, clean)]
    let file = null
    for (const c of candidates) if (await exists(c)) { file = c; break }
    if (!file) {
      missing.push(src)
      continue
    }
    const place = async (f) => {
      const inPublic = !path.relative(publicDir, f).startsWith('..')
      const rel = inPublic ? path.relative(publicDir, f) : path.relative(root, f)
      if (rel.startsWith('..')) return null
      if (!inPublic) copies.push({ from: f, to: rel })
      const size = imageSize(await readHead(f), path.extname(f).toLowerCase())
      return { url: urlOf(rel), ...(size ?? {}) }
    }
    const info = await place(file)
    if (!info) {
      missing.push(src)
      continue
    }
    const phone = phoneOf(file)
    if (await exists(phone)) info.phone = await place(phone)
    map.set(src, info)
  }
  return { map, copies, missing }
}
