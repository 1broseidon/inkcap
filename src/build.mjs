/* The whole build. One Markdown file in, one manual site out.
 *
 * The manual is the single source of truth: it is what an agent reads after
 * cloning the repo, it is the page served at the site, and it is served
 * verbatim as /llms-full.txt. There is no second copy to drift.
 *
 * The manuscript is the API. The build reads what is in the repository and
 * prints everything it can from it — the presence table in the README — and
 * nothing is required beyond the one file. Config keys override what would
 * be derived, or switch off what would be printed. render.mjs turns Markdown
 * into components, repo.mjs reads the repository's facts, capture.mjs refreshes
 * captured console blocks, guides.mjs reads the guides, machine.mjs writes the
 * editions an agent reads instead of the page. */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { refreshCaptures } from './capture.mjs'
import { findManual } from './config.mjs'
import { parseGuide, readGuides } from './guides.mjs'
import { articleLd, faqLd, graph, llmsTxt, manifestJson, robotsTxt, sitemapXml, softwareLd } from './machine.mjs'
import {
  GH_MARK, PAGE_SCRIPT, STARS_SCRIPT, commandsOf, esc, firstSentence, inline, jsonLd,
  parseChangelog, parseManual, plain, renderSections, slug,
} from './render.mjs'
import { detectLanguage, detectLicense, exists, fileDate, gitRemote, gitVersion } from './repo.mjs'
import { formatStars, readStarCount } from './stars.mjs'

export { parseChangelog, parseManual } from './render.mjs'

/* Installer scripts in the root are served at the addresses the family's
 * install one-liners already use. */
const INSTALLERS = [
  ['install.sh', ['install', 'install.sh']],
  ['install.ps1', ['install.ps1']],
  ['uninstall.sh', ['uninstall.sh']],
  ['uninstall.ps1', ['uninstall.ps1']],
]

const railList = (items) =>
  items.map((s) => `          <li><a href="${s.href}">${esc(s.label)}</a></li>`).join('\n')

const section = (id, label, blocks) => ({ id, label, blocks })

export async function build(config, { site, manual: named, frozen = false, log = () => {} } = {}) {
  const c = config
  const at = (p) => path.resolve(site, p)
  const out = at(c.out)
  const manualPath = await findManual(c, site, named)
  const root = path.dirname(manualPath)
  const inRoot = (p) => path.join(root, p)

  const [committed, css, starsJson, pkg] = await Promise.all([
    readFile(manualPath, 'utf8'),
    readFile(new URL('./page.css', import.meta.url), 'utf8'),
    readFile(at(c.stars), 'utf8').then(JSON.parse).catch(() => null),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ])

  /* ---------- what the repository says ---------- */

  const h1 = committed.match(/^#\s+(.+?)\s*$/m)?.[1] ?? ''
  const name = c.name || h1 || path.basename(root)
  const repo = c.repo || gitRemote(root)
  const version = c.version ?? gitVersion(root)
  const license = c.license ?? (await detectLicense(root))
  const language = c.language ?? (await detectLanguage(root))
  const cname = await readFile(at(path.join(c.public, 'CNAME')), 'utf8')
    .then((s) => s.split('\n')[0].trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .catch(() => '')
  const url = c.url || (cname ? `https://${cname}` : '')
  const changelogPath = c.changelog
    ? at(c.changelog)
    : (await exists(inRoot('CHANGELOG.md')))
      ? inRoot('CHANGELOG.md')
      : ''
  const guidesDir = c.guides ? at(c.guides) : inRoot('guides')
  const hasFavicon = await exists(at(path.join(c.public, 'favicon.svg')))
  const installers = []
  for (const [file, routes] of INSTALLERS) {
    if (await exists(inRoot(file))) installers.push({ file: inRoot(file), routes })
  }
  const starCount = readStarCount(starsJson, name)
  const link = (p) => (url ? `${url}${p}` : p)

  /* ---------- captures, before anything is parsed ---------- */

  const rawGuides = await readGuides(guidesDir)
  const captures = await refreshCaptures(
    [{ path: manualPath, text: committed }, ...rawGuides.map((g) => ({ path: g.file, text: g.text }))],
    { tool: c.captures?.tool ?? name, site, captures: c.captures, log },
  )
  if (!frozen) {
    for (const f of captures.files) if (f.changed) await writeFile(f.path, f.text)
    rawGuides.forEach((g, i) => (g.text = captures.files[i + 1].text))
  }
  const md = frozen ? committed : captures.files[0].text

  /* ---------- the manual ---------- */

  const doc = parseManual(md, name)
  const { title, intro, heroBlocks, heroCode, opening, sections, questions } = doc
  const guides = await Promise.all(rawGuides.map(parseGuide))
  const updated = await fileDate(manualPath)

  /* The description is the manual's own opening paragraph, stripped of
   * markup — one fewer string to keep in sync. The tagline completes the
   * <title>; without one, the lede's first sentence does when it is short. */
  const description = plain(intro[0] ?? '')
  const lede = firstSentence(description).replace(/\.$/, '')
  const tagline = c.tagline || (lede && lede.length <= 80 ? lede : '')
  const hasInstall = sections.some((s) => s.id === 'install')
  const installBlock = heroCode.find((b) => /^install\b/i.test(b.title ?? ''))
  const agentBlock = heroCode.find((b) => /agent/i.test(b.title ?? ''))
  const install = installBlock ? commandsOf(installBlock.text).trim() : ''
  const agent = agentBlock ? agentBlock.text.trim() : ''
  const commands = sections.find((s) => /^commands$/i.test(s.label))?.items ?? []

  /* The accent is the one thing the stylesheet takes from the config. */
  const accent = `:root {
  --accent-light: ${c.accent.light.accent};
  --accent-soft-light: ${c.accent.light.soft};
  --accent-dark: ${c.accent.dark.accent};
  --accent-soft-dark: ${c.accent.dark.soft};
  --term-prompt: ${c.accent.terminal.prompt};
  --term-key: ${c.accent.terminal.key};
}`

  /* The version chip is the way into the release history: the rendered
   * changelog when the site has one, the GitHub releases page otherwise. */
  const releases = changelogPath ? '/changelog/' : repo ? `https://github.com/${repo}/releases` : ''
  const chip = !version
    ? ''
    : releases
      ? `\n    <a class="ver" href="${releases}">${esc(version)}</a>`
      : `\n    <span class="ver">${esc(version)}</span>`
  const nav = [
    guides.length ? `      <a href="/guides/">guides</a>` : '',
    hasInstall ? `      <a href="/#install">install</a>` : '',
    repo
      ? `      <a class="gh" href="https://github.com/${repo}">
        ${GH_MARK}${typeof starCount === 'number' ? `\n        <span class="stars">${formatStars(starCount)}</span>` : ''}
      </a>`
      : '',
  ].filter(Boolean)
  const masthead = `  <header class="masthead">
    <a class="mark" href="/">${esc(title)}</a>${chip}${nav.length ? `\n    <nav>\n${nav.join('\n')}\n    </nav>` : ''}
  </header>`

  const footer = `      <footer>
        <span>${esc(title)}${version ? ` ${esc(version)}` : ''}</span>${license ? `\n        <span>${esc(license)} licensed</span>` : ''}${c.built ? `\n        <span>${esc(c.built)}</span>` : ''}
        <span><a href="https://github.com/1broseidon/inkcap">Published with inkcap</a></span>${
          c.family ? `\n        <span class="spacer"><a href="${esc(c.family.href)}">${esc(c.family.label)}</a></span>` : ''
        }
      </footer>`

  /* One <head> for every page the build writes. */
  const shell = ({ pageTitle, pageDescription, pagePath, robots, alternate, ld, article, content }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(pageDescription)}">
<meta name="generator" content="inkcap ${pkg.version}">${robots ? `\n<meta name="robots" content="${robots}">` : ''}${
    url ? `\n<link rel="canonical" href="${url}${pagePath}">` : ''
  }${hasFavicon ? `\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">` : ''}${
    alternate && c.editions ? `\n<link rel="alternate" type="text/markdown" href="${alternate}">` : ''
  }
<meta property="og:type" content="${article ? 'article' : 'website'}">
<meta property="og:site_name" content="${esc(name)}">${url ? `\n<meta property="og:url" content="${url}${pagePath}">` : ''}
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(pageDescription)}">${
    c.ogImage && url
      ? `\n<meta property="og:image" content="${url}${c.ogImage}">\n<meta name="twitter:card" content="summary_large_image">`
      : `\n<meta name="twitter:card" content="summary">`
  }${ld && c.jsonld ? `\n${jsonLd(ld)}` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@400&display=swap">
<style>
${accent}
${css.trim()}
</style>
</head>
<body>
<div class="wrap">

${masthead}

${content}

</div>
</body>
</html>
`

  /* A page body: the hero, the sections, the footer, and a rail when there
   * is more than one thing to point at. */
  const page = ({ hero, blocks, rail, scripts = '' }) => `  <div class="layout">
    <main class="col">

      <div class="hero">
${hero}
      </div>

${renderSections(blocks)}

${footer}

    </main>${
      rail
        ? `

    <aside class="rail">
      <nav aria-label="Contents">
${rail}
      </nav>
    </aside>`
        : ''
    }
  </div>
${scripts}`

  /* Section ids follow the headings. If the site had other ids before, links
   * to them in the wild still land: the hash is mapped before the page settles. */
  const legacy = c.legacyAnchors
    ? `<script>
(() => {
  const moved = ${JSON.stringify(c.legacyAnchors)}
  const to = moved[location.hash]
  if (to) location.replace(to)
})()
</script>`
    : ''

  const facts = {
    name, description, url, version, updated, license, repo, hasInstall, language,
  }

  const index = shell({
    pageTitle: tagline ? `${title} — ${tagline}` : title,
    pageDescription: description,
    pagePath: '/',
    alternate: '/llms-full.txt',
    ld: graph(softwareLd(facts), questions.length ? faqLd(questions) : null),
    content: page({
      hero: `        <h1>${esc(title)}</h1>
        <div class="rule"></div>
${intro.map((p, i) => `        <p class="${i === 0 ? 'lede' : 'sub'}">${p}</p>`).join('\n')}
${heroBlocks.join('\n')}`,
      blocks: [...(opening.length ? [section('', '', opening)] : []), ...sections],
      rail: sections.length
        ? `        <p class="rail-label">Contents</p>
        <ol>
${railList(sections.map((s) => ({ href: `/#${s.id}`, label: s.label })))}
        </ol>`
        : '',
      scripts: [legacy, PAGE_SCRIPT, repo ? STARS_SCRIPT(repo) : ''].filter(Boolean).join('\n'),
    }),
  })

  /* ---------- the changelog ---------- */

  let changelog = null
  if (changelogPath) {
    const groups = parseChangelog(await readFile(changelogPath, 'utf8'))
    changelog = shell({
      pageTitle: `Changelog — ${title}`,
      pageDescription: `Every release of ${title}, newest first.`,
      pagePath: '/changelog/',
      content: page({
        hero: `        <h1>Changelog</h1>
        <div class="rule"></div>
        <p class="lede">Every release of ${esc(title)}, newest first. Versions follow Semantic Versioning and match the git tags.</p>
        <p class="sub">${
          repo
            ? `The canonical file is <a href="https://github.com/${repo}/blob/main/CHANGELOG.md">CHANGELOG.md</a> in the repository; this page is rendered from it.`
            : 'This page is rendered from CHANGELOG.md in the repository.'
        }</p>`,
        blocks: groups,
        scripts: PAGE_SCRIPT,
      }),
    })
  }

  /* ---------- the guides ---------- */

  const clusters = []
  for (const g of guides) if (!clusters.includes(g.cluster)) clusters.push(g.cluster)
  const guidePages = guides.map((g) => {
    const pagePath = `/guides/${g.slug}/`
    const alternate = `/guides/${g.slug}.md`
    return {
      ...g,
      html: shell({
        pageTitle: `${g.title} — ${title}`,
        pageDescription: g.description,
        pagePath,
        alternate,
        article: true,
        ld: graph(
          articleLd({ headline: g.title, description: g.description, url: link(pagePath), updated: g.reviewed, name, siteUrl: url }),
          g.questions.length ? faqLd(g.questions) : null,
        ),
        content: page({
          hero: `        <h1>${esc(g.title)}</h1>
        <div class="rule"></div>
        <p class="lede">${inline(g.description)}</p>
        <p class="sub">A guide to <a href="/">${esc(title)}</a>${g.reviewed ? ` · Reviewed ${esc(g.reviewed)}` : ''}${
          c.editions ? ` · <a href="${alternate}">Markdown</a>` : ''
        }</p>`,
          blocks: [...(g.opening.length ? [section('', '', g.opening)] : []), ...g.sections],
          rail: `        <p class="rail-label">${esc(title)}</p>
        <ol>
${railList([{ href: '/', label: 'Manual' }, { href: '/guides/', label: 'Guides' }])}
        </ol>${
          g.sections.length
            ? `
        <p class="rail-label">Contents</p>
        <ol>
${railList(g.sections.map((s) => ({ href: `#${s.id}`, label: s.label })))}
        </ol>`
            : ''
        }`,
          scripts: PAGE_SCRIPT,
        }),
      }),
    }
  })

  const guidesIndex = guides.length
    ? shell({
        pageTitle: `Guides — ${title}`,
        pageDescription: `Short answers to specific questions about ${title}, kept beside the manual.`,
        pagePath: '/guides/',
        content: page({
          hero: `        <h1>Guides</h1>
        <div class="rule"></div>
        <p class="lede">Short answers to specific questions about ${esc(title)}, kept beside <a href="/">the manual</a>.</p>${
          c.editions
            ? `\n        <p class="sub">Each guide is also served verbatim as Markdown, at its address with <code class="inline">.md</code> in place of the trailing slash.</p>`
            : ''
        }`,
          blocks: clusters.map((cl) =>
            section(cl ? slug(cl) : '', cl, [
              {
                type: 'html',
                raw: `<ul class="plain guides">
${guides
  .filter((g) => g.cluster === cl)
  .map((g) => `        <li><a href="/guides/${g.slug}/">${esc(g.title)}</a>${g.description ? ` — ${inline(g.description)}` : ''}</li>`)
  .join('\n')}
      </ul>`,
              },
            ]),
          ),
          rail:
            clusters.length > 1
              ? `        <p class="rail-label">Contents</p>
        <ol>
${railList(clusters.map((cl) => ({ href: `#${slug(cl)}`, label: cl })))}
        </ol>`
              : '',
          scripts: PAGE_SCRIPT,
        }),
      })
    : null

  /* ---------- the 404 ---------- */

  /* A site with no server-side redirects (GitHub Pages) carries the map of
   * retired URLs in its 404 page: everything that folded into the manual lands
   * on its anchor, what stayed in the repo points at the file on GitHub, and
   * anything else says "not found" honestly rather than bouncing to the top. */
  const notFound = shell({
    pageTitle: `Not found — ${title}`,
    pageDescription: `This page is not part of the ${title} manual.`,
    pagePath: '/404.html',
    robots: 'noindex',
    content: `  <div class="layout">
    <main class="col">
      <div class="hero">
        <h1>Not found</h1>
        <div class="rule"></div>
        <p class="lede">The documentation is one page now. Whatever was at <code class="inline" id="nf-path">this address</code> is either in <a href="/">the manual</a>${
          repo ? ` or <a href="https://github.com/${repo}">in the repository</a>` : ''
        }.</p>${c.notFoundExtra ? `\n        <p class="sub">${c.notFoundExtra}</p>` : ''}
      </div>
    </main>
  </div>

<script>
(() => {
  const moved = ${JSON.stringify(c.moved ?? {})}
  const path = location.pathname.replace(/\\.html$/, '').replace(/\\/+$/, '') || '/'
  const el = document.getElementById('nf-path')
  if (el) el.textContent = path
  const to = moved[path]
  if (to) location.replace(to)
})()
</script>`,
  })

  /* ---------- the machine editions ---------- */

  const llms = llmsTxt({
    title,
    description,
    subs: intro.slice(1).map(plain),
    install,
    url,
    sections,
    guides,
    repo,
    hasInstall,
    manifest: c.manifest,
    sitemap: c.sitemap && Boolean(url),
    extra: c.llmsExtra ?? [],
  })

  const scripts = {}
  const uninstall = {}
  for (const i of installers) {
    const kind = i.routes[0].endsWith('.ps1') ? 'ps1' : 'sh'
    if (path.basename(i.file).startsWith('uninstall')) uninstall[kind] = link(`/${i.routes[0]}`)
    else scripts[kind] = link(`/${i.routes[0]}`)
  }
  const manifest = manifestJson({
    ...facts,
    tagline,
    install,
    agent,
    scripts: Object.keys(scripts).length ? scripts : undefined,
    uninstall: Object.keys(uninstall).length ? uninstall : undefined,
    changelog: Boolean(changelog),
    sections,
    commands,
    questions,
    guides,
    editions: c.editions,
  })

  const sitemap = url
    ? sitemapXml([
        { loc: `${url}/`, lastmod: updated },
        ...(changelog ? [{ loc: `${url}/changelog/`, lastmod: await fileDate(changelogPath) }] : []),
        ...(guides.length
          ? [{ loc: `${url}/guides/`, lastmod: guides.map((g) => g.reviewed).sort().pop() }]
          : []),
        ...guides.map((g) => ({ loc: `${url}/guides/${g.slug}/`, lastmod: g.reviewed })),
      ])
    : ''

  /* ---------- write ---------- */

  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  if (await exists(at(c.public))) await cp(at(c.public), out, { recursive: true })

  /* A file that came from public/ wins over anything the build would write
   * at the same path. */
  const kept = []
  const emit = async (rel, content) => {
    const p = path.join(out, rel)
    if (await exists(p)) {
      kept.push(rel)
      return
    }
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, content)
  }

  await emit('index.html', index)
  await emit('llms.txt', llms)
  await emit('llms-full.txt', md)
  if (c.manifest) await emit('manifest.json', manifest)
  if (c.robots) await emit('robots.txt', robotsTxt({ name, url, sitemap: c.sitemap && Boolean(url) }))
  if (c.sitemap && sitemap) await emit('sitemap.xml', sitemap)
  if (c.moved) await emit('404.html', notFound)
  if (c.redirects) await emit('_redirects', c.redirects)
  if (changelog) await emit('changelog/index.html', changelog)
  if (guidesIndex) await emit('guides/index.html', guidesIndex)
  for (const g of guidePages) {
    await emit(`guides/${g.slug}/index.html`, g.html)
    if (c.editions) await emit(`guides/${g.slug}.md`, g.text)
  }
  for (const i of installers) {
    const body = await readFile(i.file)
    for (const r of i.routes) await emit(r, body)
  }

  const disclosures = sections.reduce((n, s) => n + s.items.length, 0)
  return {
    out,
    bytes: Buffer.byteLength(index),
    sections: sections.length,
    disclosures,
    version,
    changelog: Boolean(changelog),
    guides: guides.length,
    questions: questions.length,
    captures,
    kept,
    name,
    repo,
    url,
  }
}
