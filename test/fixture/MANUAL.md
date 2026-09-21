# fixture

A small tool that exists so inkcap can be tested. It does one thing, and
does it with `--json`.

For people, it is a command. For agents, it is a tool.

```console title="Install"
$ curl -fsSL https://fixture.example/install | sh
```

```console title="Or hand it to your agent"
Install fixture and configure it for me.
```

## Overview

Fixture answers "what is this?" with a table and a callout.

> **It works before it is configured.** Nothing to set up.

| The question needs | Use | Not |
| --- | --- | --- |
| A quick answer | `ask` | `search` — slower |
| Everything at once | `dump` | looped `ask` |

## Install

The install script picks the build for your OS.

#### Homebrew — macOS and Linux

```console
$ brew install fixture
```

#### npm — or skip the install with npx

```console
$ npm install -g fixture-cli
```

## Exit status

| Code | Meaning | What to do |
| --- | --- | --- |
| ok: 0 | Success | Read the result |
| warn: 2 | Bad input | Fix the call |
| crit: 4 | Upstream failure | Retry once |

### Worked session

```console
$ fixture ask "why" --limit 5
→ exit 4: [upstream] rate limited
  # rotate, don't retry unchanged

$ fixture ask "why" -b other
→ 5 results
```

Config on disk:

```yaml
backend: auto
limit: 5
```

## Research playbook

- **Bad** `fixture dump` — no bound.
- **Good** `fixture dump --max-chars 6000` — bounded.
- **Bad** Retry the identical call three times.
- **Good** Rotate to another backend, retry once.

## For agents

Two files on this domain are written for agents: [/llms.txt](/llms.txt) and
[/llms-full.txt](/llms-full.txt).

## Questions

#### Does fixture need a config file?

No. It works before it is configured, and `fixture config` shows what it
inferred.

#### Can I run it offline?

Yes, every command works without a network; only `--upstream` reaches out.

## Notes

- **Bare domains** may return llms.txt instead of the homepage.
- **Batch calls** report per-item failures inside a successful call.
