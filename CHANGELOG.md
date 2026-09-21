# Changelog

All notable changes to inkcap are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-09-21

The manuscript is the API. `inkcap build` reads what is in the repository and
prints everything it can from it; nothing is required beyond one Markdown
file, and every feature appears when what it needs is present. The four
family sites build unchanged: what they gain is invisible on the page.

### Added

- Zero requirements: `inkcap build` with no config finds `./MANUAL.md`,
  `../MANUAL.md` or `./README.md` (or the file named on the command line),
  takes the name from the `#` heading, the description from the first
  paragraph, the repository from `git remote`, the version from
  `git describe`, and prints the page in the default ink. A plain Markdown
  file with no sections is a clean page. Every config key is now optional.
- Presence rules: a root `CHANGELOG.md` is rendered at `/changelog/` without
  being named in the config; a root `LICENSE` names the licence in the
  footer; root `install.sh`, `install.ps1`, `uninstall.sh` and
  `uninstall.ps1` are served at `/install`, `/install.sh`, `/install.ps1`,
  `/uninstall.sh` and `/uninstall.ps1`; `public/CNAME` supplies the url;
  a file in `public/` wins over anything the build would write at the same
  path.
- Guides: one Markdown file each in `guides/` beside the manual, with
  `title`, `description`, optional `cluster` and `reviewed` frontmatter.
  Each is printed at `/guides/<slug>/` in the manual's shell, served
  verbatim at `/guides/<slug>.md`, listed at `/guides/` and in the masthead,
  and carries TechArticle and FAQPage JSON-LD.
- Captures: a ```` ```console capture ```` block is refreshed by the build.
  Prompt lines whose first word is the tool's name run in document order in
  a fresh sandbox at a fixed path with its own `HOME`, seeded from
  `fixture/`; the output under each prompt is replaced, with `→ exit N` on
  a non-zero exit; the manual is rewritten in place and `git diff` is the
  review. Nothing runs when the tool is not on `PATH`. `--frozen` never
  writes and exits non-zero on drift, for release workflows. The `captures`
  config adds setup commands, environment, a `PATH` entry, masks and a
  timeout.
- Agent editions: `manifest.json` (the site as one object: name, tagline,
  install command and scripts, agent prompt, sections and commands with
  anchors and one-line summaries, guides, questions), `sitemap.xml`,
  `robots.txt` naming the AI crawlers, JSON-LD on every page
  (SoftwareApplication, TechArticle, FAQPage), and a
  `rel="alternate" type="text/markdown"` link to each page's Markdown twin.
  `robots`, `sitemap`, `manifest`, `jsonld` and `editions` switch each off.
- A `## Questions` section's `####` rows become FAQPage JSON-LD.
- Disclosures carry ids (the slug of their name, section-prefixed on a
  collision), and a link to one opens it.
- `llms.txt` now carries the install command near the top and a one-line
  summary for every section and guide, in the llmstxt.org link shape.
- `og:site_name` and a `twitter:card` on every page.

### Changed

- `llms.txt` section entries are `- [Label](url): summary` rather than
  `- Label: url`.
- The footer's licence line comes from `LICENSE` (or the `license` key)
  instead of being printed as MIT for every site; the masthead's install
  link appears only when the manual has an Install section.
- The build is split into modules: render, repo, capture, guides, machine.

### Fixed

- Text in `llms.txt`, meta descriptions and JSON-LD is decoded rather than
  HTML-escaped (a quoted phrase in the lede no longer prints as `&quot;`).

## [0.2.0] - 2026-09-20

### Added

- Live star count: the masthead asks GitHub for the repo's current star count
  on each visit and falls back to the baked `stars.json` value. Counts of a
  thousand or more print as `1.2k`, as ketch.run did before the port.

### Changed

- The README and package description lead with GitHub Pages as the intended
  host; other static hosts remain supported.

## [0.1.0] - 2026-09-20

### Added

- First release, extracted from the builds behind ketch.run, cymbal.sh and
  brainfile.md so the three sites share one implementation instead of three
  copies.
- `inkcap build` renders `../MANUAL.md` into `dist/`: the manual page, a
  generated `llms.txt`, the manual itself as `llms-full.txt`, an optional
  `404.html` carrying a map of retired URLs, an optional `_redirects` file,
  and an optional `/changelog/` rendered from the repo's `CHANGELOG.md`.
- `inkcap stars` refreshes the star count shown in the masthead.
- The accent colour is the one thing a site sets; everything else in the
  house style is shared.
- Every page carries the imprint: a `generator` meta tag and a
  "Published with inkcap" line in the footer.
