CREATE TABLE `pkce_verifiers` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state` text NOT NULL,
	`verifier` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pkce_verifiers_state_unique` ON `pkce_verifiers` (`state`);--> statement-breakpoint
CREATE INDEX `idx_pkce_verifiers_expires_at` ON `pkce_verifiers` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_keys_user_key_name` ON `api_keys` (`created_by`,`key_name`);