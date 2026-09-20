# Changelog

All notable changes to inkcap are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
