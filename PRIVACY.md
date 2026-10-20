# Privacy

Spernakit is a template you copy and self-host. It has no hosted service, no account with us, and
nothing that reports back.

## The template collects nothing

Spernakit does not send usage analytics, crash reports, or telemetry to us or to any third party.
There is no collection to opt out of because there is no collection. Nothing in the template makes
an outbound network call to anything belonging to the template's authors.

## Your app is yours

Once you copy the template, the application and its data are entirely yours: your database, your
hosting, your users. Nothing in this document can describe what your app collects, because that is
decided by what you build on top of the baseline.

What the **baseline** keeps, in your own database, so you know what you are inheriting:

- **Accounts** - user records, password hashes, and the settings for lockout and reset.
- **Sessions** - authentication cookies and their server-side state.
- **Audit log** - who did what and when, which is the point of having one.
- **Notifications** - what was sent to whom.
- **Uploads** - whatever your users upload, wherever you configured it to live.
- **Health and operational records** - checks, scheduled task results, and their history.

Most of it lives in the database you configure and is readable by anyone with access to it.
Uploads are the exception: they go through the configured storage adapter, which is local disk or
S3 rather than the database. Session cookies live in the reader's browser.

Selected secrets ARE encrypted by the template, including MFA material and OAuth tokens. There is
no blanket database or disk encryption; that is a property of your deployment rather than something
the template provides.

## What you have to decide

The template gives you the machinery and leaves the policy to you. Retention, who may read the audit
log, what a notification is allowed to contain, how long uploads are kept, and whether any of it
crosses a border are all your decisions. If your app has users who are not you, they will need a
privacy policy describing those decisions - this document is about the template, not about your app.
