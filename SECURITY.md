# Security Policy

Spernakit is a full-stack application template: you copy it, configure it, and deploy your own
instance with your own database, secrets, and users. Security fixes land in the template so adopters
can pull them into their apps. We take reports seriously and appreciate responsible disclosure.

## Supported versions

Security fixes are made against the latest released version of the template. Please reproduce issues
on the most recent release before reporting.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting (**Security → Report a vulnerability** on the
repository) to open a confidential advisory. Include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected version(s) and environment,
- any suggested remediation.

We aim to acknowledge a report within a few days and to keep you updated as we investigate and
prepare a fix. We will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope and good-faith guidance

Spernakit ships auth, RBAC, account lockout/reset, key generation, and multi-user audit as template
features. When assessing security, keep in mind:

- **Template vs. deployment.** Report issues in the template's shipped code (auth flows, input
  validation, session handling, the API surface). Misconfiguration of a _derived_ app you deployed
  (weak secrets, exposed `.env`, permissive CORS you set) is the adopter's responsibility, not a
  template vulnerability. That said, we welcome a heads-up if the template's defaults invited it.
- **Secrets.** The template expects secrets (DB credentials, OAuth client secrets, signing keys) to
  come from environment/configuration and never be committed. Reports of hardcoded or default-shipped
  secrets are in scope.
- **Auth boundary.** Issues that let an unauthenticated or under-privileged user reach protected
  routes, escalate roles, or bypass lockout/reset are high priority.

Reports that require already-untrusted access to the deployment host or database are generally out of
scope, but we still want to hear about them.
