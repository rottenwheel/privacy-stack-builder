# Privacy Stack Builder

Static site where anyone assembles a personal privacy stack from a pool of
tools that pass an explicit admission policy. No backend, no cookies, no
external requests. A stack is encoded in the URL fragment so it can be shared
without a server ever seeing it.

## Layout

```
data/
  criteria.yaml     badges a tool can carry (FOSS, E2EE, no phone #, ...)
  policy.yaml       global criteria required for admission to the pool
  categories.yaml   slots, display order, max picks, per-slot require/waive
  presets.yaml      threat-model presets (author's stack, everyday, ...)
  tools/*.yaml      one file per category, one entry per tool
build.py            validates data against policy, emits site/data.js
site/               index.html, style.css, app.js, data.js (generated)
```

## Build and run

```
python3 build.py            # needs pyyaml
python3 -m http.server -d site 8080
```

Or open `site/index.html` directly; data is inlined as `data.js` so `file://`
works too.

The build exits non-zero when a tool is dropped for failing the policy, so a
CI job on pull requests doubles as the admission check.

## Adding a tool

Append an entry to the matching `data/tools/<category>.yaml`:

```yaml
- id: kebab-id
  name: Display Name
  category: messenger
  platforms: [android, ios, linux, macos, windows, web]
  jurisdiction: CH        # ISO country code, or "none" for unincorporated projects
  url: https://example.org
  criteria: [foss, e2ee, no-phone]
  why: One sentence on why someone would pick it.
  warn: One sentence on the trade-off. Optional but encouraged.
  wip: true               # optional, marks unreleased software
```

Run `python3 build.py`. If the tool misses a required criterion the build
says so and drops it.

## Sharing

The URL fragment looks like:

```
#v1&mobile-os=grapheneos&messenger=simplex,signal&browser=tor-browser,brave
```

Order within a slot is primary first. Fragments are never sent to the server.

## CI

`.gitea/workflows/check.yml` runs `build.py` on pull requests and pushes to
`main`. It fails when a tool violates the policy or when `site/data.js` was
not rebuilt. It needs Gitea Actions enabled for the repository and a runner
with the `ubuntu-latest` label; `deploy/runner/` contains a docker compose
setup for one.

## Deploy

Production is https://privacystack.rocks, a plain nginx vhost. Deploy is a
file copy of `site/` after a build:

```
python3 build.py
rsync -az --delete site/ root@89.167.107.136:/home/alex/web/privacystack.rocks/public_html/
```
