DROP INDEX `pkce_verifiers_state_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pkce_verifiers_state` ON `pkce_verifiers` (`state`);
