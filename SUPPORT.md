# Support

Thanks for using Spernakit. Here is where to go for help.

## Questions and discussion

For "how do I…", configuration, deployment, and general questions, use **GitHub Discussions** on the
Spernakit repository. Search existing threads first; your question may already be answered.

Before asking, it is worth checking:

- **[docs/template/STACK.md](docs/template/STACK.md)** - the technical stack and architecture
  reference: what is wired, where it lives, and why.
- **[docs/template/DEVELOPMENT.md](docs/template/DEVELOPMENT.md)** - coding style, conventions, and
  the practices the gates enforce.
- **[CHANGELOG.md](docs/template/CHANGELOG.md)** - what changed, release by release.

## Bugs

Open a GitHub issue. The useful ones say what you ran, what happened, and what you expected, and
include the template version you started from and your Bun version from `bun --version`.

## Template, not a product

Spernakit is a template you copy. Once you have copied it, the application is yours: your database,
your configuration, your users, your deployment. Issues in **the template** - something it ships
broken, a gate that is wrong, a document that misleads - belong here. Issues in **an app built from
it** usually do not, unless you can reproduce them in a fresh copy of the template.

That distinction is the useful one when deciding where to ask: if `bun run smoke:qc` fails on a
clean checkout, that is ours. If it fails on your app after six months of your own changes, start by
checking what drifted.

## Keeping up with the template

The template moves. Adopters pull changes in rather than receiving them automatically, and the
drift checks exist to tell you where your copy and the template have diverged. There is no automatic
upgrade path, and there is deliberately no compatibility layer pretending one version is another.
