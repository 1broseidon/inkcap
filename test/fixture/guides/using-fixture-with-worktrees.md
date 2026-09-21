---
title: Using fixture with git worktrees
description: One store, one project, however many worktrees.
cluster: Workflows
reviewed: 2026-09-21
---

**A worktree shares its main clone's store**, so nothing needs configuring:
fixture maps the worktree back to the clone it was created from.

## Which project does a worktree belong to?

The main clone's. Run `fixture status` in the worktree and the project line
names the clone, as the manual's [status](/#exit-status) section describes.

```console
$ fixture status
project: /home/me/fixture
```

## How do I keep a worktree's store separate?

Point `FIXTURE_DB` at another file before the first command.
