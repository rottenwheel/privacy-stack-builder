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

The policy has two parts. `required` lists criteria every tool must carry.
`any_of` lists groups where at least one criterion must be present; today
the only group is `[foss, source-available]`, which admits OSI-licensed
software and source-published but restrictively licensed software (FUTO's
apps, for example) while giving them different badges so the reader can
tell them apart. A category can `waive` a criterion, which removes it from
`required` and skips any group containing it; hosted search engines and
mail services waive `foss` this way.

## Suggesting a tool

Contributions happen on Codeberg: https://codeberg.org/schmidt1024/privacy-stack-builder

The quickest route is the "Suggest a tool" button on the site. It turns a
short form into a ready-made YAML entry and opens a prefilled Codeberg issue.
Pull requests against `data/tools/<category>.yaml` are welcome too. The
Gitea instance at gitea.schmidt.eco is the origin and deploy source; `main`
is mirrored to Codeberg by CI after every green build.

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

Production is https://privacystack.rocks, a plain nginx vhost, with a Tor
mirror at http://73zofwr6jvnvriyd5mxq5oneli657btt5pi5xiwqvys55fa7pozmhdad.onion
served from the same docroot.

Every push to `main` that passes the check job is deployed by the `deploy`
job in `.gitea/workflows/check.yml`. It rsyncs `site/` over SSH with a key
that the server restricts (via `rrsync`) to the docroot; the private key is
the repository secret `DEPLOY_SSH_KEY`. The server host key is pinned in the
workflow.

Manual deploy, if ever needed:

```
python3 build.py
rsync -az --delete site/ root@89.167.107.136:/home/alex/web/privacystack.rocks/public_html/
```
