# Contributing

Contributions are accepted on Codeberg:
https://codeberg.org/schmidt1024/privacy-stack-builder

## Suggest a tool

Use the "Suggest a tool" button on https://privacystack.rocks. It produces a
YAML entry and opens a prefilled issue. Or open an issue or pull request
directly.

A pull request adds one entry to `data/tools/<slot>.yaml` (see the README
for the fields) and includes the rebuilt `site/data.js`:

```
python3 build.py
git add data/tools/<slot>.yaml site/data.js
```

## What gets admitted

The build enforces `data/policy.yaml`. Today that means the tool must be
FOSS or source-available, plus whatever the slot requires (E2EE for
messengers, local-first for keyboards, and so on). If the build drops your
entry, the warning names the missing criterion.

Tick a criterion only if you can point to evidence: the license file, a
published audit, the payment page listing Monero, and so on. Put the links
in the pull request or issue.

## Style

- `why` is one sentence on why someone would pick it.
- `warn` is one sentence on the trade-off. Almost every tool has one.
- `jurisdiction` is the ISO code of the legal entity, or `none` for
  unincorporated projects. Ownership changes belong in `warn`.

## License

By contributing you agree that your changes are licensed like the rest of
the project: code under AGPL-3.0-or-later, pool data under CC BY-SA 4.0.
