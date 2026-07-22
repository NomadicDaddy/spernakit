# Contributing to Spernakit

Thanks for your interest in Spernakit. A few honest notes on how this project is run.

## What Spernakit is

Spernakit is a **full-stack application template** - it is meant to be copied or forked as the
starting point for your own app. Most of the time the right move is to _use_ it, not to change
the template itself. That said, improvements to the template are welcome.

## Project posture

Spernakit is maintained by a single author as time allows. **Bug reports, questions, and
discussion are genuinely welcome.** Pull requests are _considered but not solicited_ - an
unsolicited PR may be declined or sit for a while. For anything non-trivial, **open an
issue first** so we can agree on the approach.

## Reporting bugs and ideas

- Search existing issues first.
- For bugs: include your OS, Bun version, steps to reproduce, and expected vs actual behavior.
- For template changes: explain why it belongs in the template (something most derived apps
  would want) rather than in a single app.

## Security

Please do **not** open public issues for security problems. See
[docs/template/SECURITY.md](docs/template/SECURITY.md) for how to report privately.

## Development

Spernakit is a Bun + TypeScript monorepo (backend, frontend, shared).

- Install [Bun](https://bun.sh) (see `package.json` for the version).
- `bun install`
- Run the gates before proposing a change: `bun run smoke:qc` plus the lint / typecheck /
  format checks defined in `package.json`.

See `README.md` and `docs/template/` for the stack and development practices.

## License of contributions

Spernakit is licensed under the **MIT License** - see [LICENSE](LICENSE). By submitting a
contribution you agree that it is provided under the MIT License and that you have the right to
submit it. There is no CLA.
