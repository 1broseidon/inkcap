# inkcap

Publishes a `MANUAL.md` as a one-page manual site. Made for GitHub Pages;
any static host works.

An inkcap is the mushroom whose cap melts into a black ink that people once
wrote with. As a name it is a small imprint: a repo's `MANUAL.md` goes in,
and out comes the finished page in the tool's own accent, with the files an
agent expects next to it, and a "Published with inkcap" line at the foot.

It is the build behind [ketch.run](https://ketch.run),
[cymbal.sh](https://cymbal.sh) and [brainfile.md](https://brainfile.md).
There is no framework: one Node script, `marked` at build time, and the only
JavaScript shipped is a copy button and the live star count.

## Use

A site is a directory, usually `site/`, next to the repo's `MANUAL.md`:

```
MANUAL.md
CHANGELOG.md            optional, rendered at /changelog/
site/
  inkcap.config.mjs     everything that differs from the other sites
  package.json          { "devDependencies": { "inkcap": "^0.1.0" } }
  public/               copied into dist/ untouched: favicon.svg, CNAME, ...
  stars.json            written by `inkcap stars`, committed
```

```console
$ cd site
$ npm install --save-dev inkcap
$ npx inkcap stars      # GitHub star count for the masthead, into stars.json
$ npx inkcap            # render into dist/
built dist/index.html  44.03 kB  ·  8 sections  ·  23 disclosures  ·  v0.15.0
```

`package.json` for a site is two lines of scripts:

```json
{
  "scripts": {
    "build": "inkcap build",
    "prebuild": "inkcap stars"
  }
}
```

The version chip in the masthead comes from `git describe --tags`, so the site
cannot claim a version the repo has not tagged. Set `version` in the config to
override it.

## Writing the manual

`MANUAL.md` is plain CommonMark. Read on GitHub it is a well-formed document;
inkcap reads a few conventions in it to build the richer components.

| Markdown | Becomes |
| --- | --- |
| `# Title` | the page title; the paragraphs under it are the hero lede and sub |
| ```` ```console title="X" ```` before the first `##` | a copy block in the hero |
| `## Heading` | a section, and one entry in the sticky rail |
| `### Heading` | a mono subhead |
| `#### name — note` | a collapsible row; the text after ` — ` is the muted tail |
| `> quote` | an accent callout |
| ```` ```console ```` | a terminal block: prompts tinted, `#` comments dimmed, `→` lines dimmed, `→ exit N` lines warned |
| ```` ```console title="X" ```` | the same, with a labelled copy bar; the copy drops the `$` prompts |
| ```` ```yaml ````, ```` ```json ```` | a plain block, no shell highlighting |
| `\| a \| b \|` | a table that scrolls instead of overflowing |
| a cell of `` `cmd` `` | a command cell |
| a cell of `ok: 0`, `warn: 2`, `crit: 4` | a status cell, tinted by severity |
| a cell starting with a digit, `~` or `≈` | a numeric cell |
| a list whose items all open with `**Bad**` or `**Good**` | contrast pairs; each Bad starts a new pair |

The three sites keep the same spine, which is what makes them read as one
family: the hero with the Install and "Or hand it to your agent" copy blocks,
then Overview, Install, Quickstart, Choosing a command, Commands, the tool's
own sections, For agents, Notes. Nothing enforces that; it is a convention
worth keeping.

Section ids are the heading slugs (`## Choosing a command` is
`#choosing-a-command`). If a heading is renamed, add the old id to
`legacyAnchors` so links in the wild still land.

## Configuration

`inkcap.config.mjs` exports one object.

```js
export default {
  name: 'cymbal',
  url: 'https://cymbal.sh',
  repo: '1broseidon/cymbal',
  tagline: 'code navigation for coding agents',   // <title> is "name — tagline"
  built: 'Built with tree-sitter and SQLite',      // the footer's third item
  accent: {
    light: { accent: '#34558C', soft: '#E3E9F3' },
    dark: { accent: '#8AAEE0', soft: '#1A2436' },
    terminal: { prompt: '#7E9FD4', key: '#A8C2EA' },
  },
}
```

| Key | Meaning |
| --- | --- |
| `name` | the tool's name; the `#` title in the manual wins for display |
| `url` | the site's origin, for canonical and Open Graph links |
| `repo` | `owner/name` on GitHub, for the masthead link and the star count |
| `tagline` | completes the `<title>` |
| `built` | the footer line, after the licence |
| `accent` | the one part of the stylesheet that is the site's own: light and dark accent with their soft tints, and the terminal prompt and quoted-string tints |
| `manual` | path to the manual, default `../MANUAL.md` |
| `changelog` | path to a Keep-a-Changelog file; when set, `/changelog/` is rendered and the version chip links to it, otherwise to the GitHub releases page |
| `version` | overrides `git describe --tags` |
| `ogImage` | site-relative path of the Open Graph image |
| `legacyAnchors` | `{ '#old': '#new' }`, remapped before the page settles |
| `moved` | `{ '/old/path': '/#anchor' }`; when set, a `404.html` is written that carries the map, for hosts with no server-side redirects |
| `redirects` | the literal contents of a `_redirects` file, for hosts that honour one |
| `llmsExtra` | extra lines for the Links section of `llms.txt` |
| `notFoundExtra` | a sentence added to the 404 page |
| `out`, `public`, `stars` | output, assets and star-count paths, defaults `dist`, `public`, `stars.json` |

## What comes out

```
dist/
  index.html            the manual
  llms.txt              a short index for agents: description, sections, links
  llms-full.txt         MANUAL.md, verbatim
  404.html              when `moved` is set
  _redirects            when `redirects` is set
  changelog/index.html  when `changelog` is set
  ...                   everything from public/
```

Every page carries a `<meta name="generator" content="inkcap x.y.z">` tag
and the "Published with inkcap" line in its footer. The masthead's star count
is baked in from `stars.json` and refreshed from the GitHub API on each visit,
so the page stays current between builds.

## Hosting

The output is a static directory. GitHub Pages is the home it is made for:
the workflow below is the whole deployment. The version chip comes from git
tags, so it needs the full history and a run on each release; the star count
is fetched with the workflow's own token and kept live by the page itself.

```yaml
name: Deploy site
on:
  push:
    branches: [main]
    paths: ['MANUAL.md', 'site/**']
  release:
    types: [published]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: site/package-lock.json
      - run: cd site && npm ci && npm run build
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: site/dist
          cname: example.sh
```

Any static host serves the same directory. **Cloudflare Workers**, for
instance, deployed by hand with `wrangler deploy` from `site/`:

```jsonc
{
  "name": "example-sh",
  "compatibility_date": "2026-09-01",
  "assets": { "directory": "./dist", "not_found_handling": "none" },
  "routes": [{ "pattern": "example.sh", "custom_domain": true }]
}
```

A `redirects` string in the config becomes the `_redirects` file Workers
honours; a `moved` map becomes the `404.html` GitHub Pages serves.

## Development

```console
$ npm test
```

The test builds a fixture manual that uses every convention and checks each
output file. Anything that changes the rendered HTML should change the
fixture assertions with it.

## License

MIT
