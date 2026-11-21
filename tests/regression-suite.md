# Regression suite

These are the flows that must never break. `bun run test:regression-suite` runs every case in the
full gate against an isolated copy of the app, each on a fresh copy of the seeded database, and
any failing case fails the gate. Keep five to ten cases, numbered from TC-001 with no gaps. To drop
a flow, delete its entry so review sees it. A commented-out case is refused.

Each case is a `## TC-NNN: title` heading followed by one fenced `tc` block. The block is the
executable contract; write the prose around it for people. The steps, and the rules the parser
holds them to, are documented in `scripts/lib/regression/suite.ts`. In short: `goto`, `signIn`,
`click`, `fill`, `expectUrl`, `expectText`, `expectSelector` and `restartBackend`; selectors by
`testId` or by ARIA `role` and `name`, never CSS; same-origin paths only; at least one expect step
per case; and `${runId}` in a value or expected text for this run's unique id.

This file is about what must keep working. The natural-language catalogue of how to test the app,
`.aidd/testing-scenarios.md`, stays local with the rest of aidd's files.

## TC-001: Signing in reaches the dashboard

Role: SYSOP. If this fails, nobody can use the app.

```tc
{
	"role": "SYSOP",
	"steps": [{ "goto": "/login" }, { "signIn": true }, { "expectUrl": "/dashboard" }]
}
```

## TC-002: The dashboard renders for a signed-in user

Role: SYSOP. The landing page loads its own content, not just the layout around it.

```tc
{
	"role": "SYSOP",
	"steps": [
		{ "signIn": true },
		{ "goto": "/dashboard" },
		{ "expectText": "Overview of your application" }
	]
}
```

## TC-003: A workspace can be created

Role: SYSOP. Creating the template's core entity works end to end.

```tc
{
	"role": "SYSOP",
	"steps": [
		{ "signIn": true },
		{ "goto": "/workspaces" },
		{ "click": { "name": "Create Workspace", "role": "button" } },
		{ "fill": { "name": "Name", "role": "textbox" }, "value": "rs-create-${runId}" },
		{ "click": { "name": "Create", "role": "button" } },
		{ "expectText": "rs-create-${runId}" }
	]
}
```

## TC-004: A created workspace survives a backend restart

Role: SYSOP. What was saved is still there after the server restarts, so it was written to the
database rather than held in memory.

```tc
{
	"role": "SYSOP",
	"steps": [
		{ "signIn": true },
		{ "goto": "/workspaces" },
		{ "click": { "name": "Create Workspace", "role": "button" } },
		{ "fill": { "name": "Name", "role": "textbox" }, "value": "rs-keep-${runId}" },
		{ "click": { "name": "Create", "role": "button" } },
		{ "expectText": "rs-keep-${runId}" },
		{ "restartBackend": true },
		{ "goto": "/workspaces" },
		{ "expectText": "rs-keep-${runId}" }
	]
}
```

## TC-005: Signed-out visitors are sent to sign in

Role: SYSOP (not used: this case never signs in). A protected page redirects to the login page.

```tc
{
	"role": "SYSOP",
	"steps": [{ "goto": "/dashboard" }, { "expectUrl": "/login" }]
}
```
