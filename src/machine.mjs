/* The machine editions: the files an agent or a crawler reads instead of the
 * page. Every one is derived from the same Markdown as the page, so none can
 * disagree with it. Absent facts are absent lines and absent keys. */

const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'Claude-SearchBot',
  'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot',
  'Applebot-Extended', 'CCBot', 'Amazonbot', 'Bytespider', 'meta-externalagent',
]

/* /llms.txt: the short index an agent reads first, in the llmstxt.org shape —
 * a title, a blockquote summary, then link lists with one-line notes. */
export const llmsTxt = ({
  title, description, subs = [], install, url, sections = [], guides = [], repo,
  hasInstall, manifest, sitemap, extra = [],
}) => {
  const link = (p) => (url ? `${url}${p}` : p)
  const lines = [`# ${title}`, '', `> ${description}`, '']
  if (subs.length) lines.push(...subs.flatMap((s) => [s, '']))
  if (install) {
    const cmds = install.split('\n').filter(Boolean)
    if (cmds.length === 1) lines.push(`Install: ${cmds[0]}`)
    else lines.push('Install:', ...cmds.map((l) => `    ${l}`))
  }
  lines.push(`The full manual, as Markdown: ${link('/llms-full.txt')}`, '')
  if (sections.length) {
    lines.push('## Sections', '')
    for (const s of sections) lines.push(`- [${s.label}](${link(`/#${s.id}`)})${s.summary ? `: ${s.summary}` : ''}`)
    lines.push('')
  }
  if (guides.length) {
    lines.push('## Guides', '', 'Each guide is also served verbatim as Markdown at its address with .md in place of the trailing slash.', '')
    for (const g of guides) lines.push(`- [${g.title}](${link(`/guides/${g.slug}/`)})${g.description ? `: ${g.description}` : ''}`)
    lines.push('')
  }
  lines.push('## Links', '')
  if (hasInstall) lines.push(`- Install: ${link('/#install')}`)
  if (repo) lines.push(`- Source: https://github.com/${repo}`)
  if (manifest) lines.push(`- Site as data: ${link('/manifest.json')}`)
  if (sitemap && url) lines.push(`- Sitemap: ${url}/sitemap.xml`)
  lines.push(...extra)
  return lines.join('\n').trimEnd() + '\n'
}

export const sitemapXml = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map((e) => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>
`

/* Everyone may read the site. The AI crawlers are named so that turning one
 * away later is a decision made in this file, not an accident of a default. */
export const robotsTxt = ({ name, url, sitemap }) =>
  `# ${name}${url ? ` — ${url}` : ''}
User-agent: *
Allow: /

# AI crawlers, named so a later change is deliberate
${AI_CRAWLERS.map((ua) => `User-agent: ${ua}`).join('\n')}
Allow: /
${sitemap && url ? `\nSitemap: ${url}/sitemap.xml\n` : ''}`

/* The site as one object, for a registry or a tool-installing skill. The
 * `inkcap` key is the shape's version; it changes only when a key changes
 * meaning. */
export const manifestJson = (m) => {
  const link = (p) => (m.url ? `${m.url}${p}` : p)
  const data = {
    inkcap: 1,
    name: m.name,
    tagline: m.tagline || undefined,
    description: m.description || undefined,
    url: m.url || undefined,
    repo: m.repo ? `https://github.com/${m.repo}` : undefined,
    version: m.version || undefined,
    license: m.license || undefined,
    language: m.language || undefined,
    updated: m.updated || undefined,
    install:
      m.install || m.hasInstall || m.scripts
        ? {
            command: m.install || undefined,
            page: m.hasInstall ? link('/#install') : undefined,
            scripts: m.scripts,
            uninstall: m.uninstall,
          }
        : undefined,
    agent: m.agent || undefined,
    manual: { html: link('/'), markdown: link('/llms-full.txt'), index: link('/llms.txt') },
    changelog: m.changelog ? link('/changelog/') : undefined,
    sections: m.sections.map((s) => ({
      id: s.id,
      label: s.label,
      summary: s.summary || undefined,
      url: link(`/#${s.id}`),
    })),
    commands: m.commands?.length
      ? m.commands.map((d) => ({ name: d.name, summary: d.tail || undefined, url: link(`/#${d.id}`) }))
      : undefined,
    questions: m.questions?.length ? m.questions.map((q) => q.question) : undefined,
    guides: m.guides.length
      ? m.guides.map((g) => ({
          slug: g.slug,
          title: g.title,
          description: g.description || undefined,
          cluster: g.cluster || undefined,
          reviewed: g.reviewed || undefined,
          url: link(`/guides/${g.slug}/`),
          markdown: m.editions ? link(`/guides/${g.slug}.md`) : undefined,
          questions: g.questions.length ? g.questions.map((q) => q.question) : undefined,
        }))
      : undefined,
  }
  return JSON.stringify(data, null, 2) + '\n'
}

/* ---------- JSON-LD ---------- */

export const softwareLd = (m) => ({
  '@type': 'SoftwareApplication',
  name: m.name,
  description: m.description || undefined,
  url: m.url ? `${m.url}/` : undefined,
  applicationCategory: 'DeveloperApplication',
  softwareVersion: m.version || undefined,
  dateModified: m.updated || undefined,
  license: m.license ? `https://spdx.org/licenses/${m.license}.html` : undefined,
  offers: m.license ? { '@type': 'Offer', price: '0', priceCurrency: 'USD' } : undefined,
  installUrl: m.hasInstall && m.url ? `${m.url}/#install` : undefined,
  sameAs: m.repo ? [`https://github.com/${m.repo}`] : undefined,
})

export const articleLd = ({ headline, description, url, updated, name, siteUrl }) => ({
  '@type': 'TechArticle',
  headline,
  description: description || undefined,
  url,
  inLanguage: 'en',
  dateModified: updated || undefined,
  author: { '@type': 'Organization', name, url: siteUrl || undefined },
  publisher: { '@type': 'Organization', name, url: siteUrl || undefined },
  isPartOf: siteUrl ? { '@type': 'WebSite', name, url: `${siteUrl}/` } : undefined,
})

export const faqLd = (questions) => ({
  '@type': 'FAQPage',
  mainEntity: questions.map((q) => ({
    '@type': 'Question',
    name: q.question,
    acceptedAnswer: { '@type': 'Answer', text: q.answer },
  })),
})

/* One @context, and a @graph only when there is more than one node. */
export const graph = (...nodes) => {
  const list = nodes.filter(Boolean)
  if (!list.length) return null
  return list.length === 1
    ? { '@context': 'https://schema.org', ...list[0] }
    : { '@context': 'https://schema.org', '@graph': list }
}
