CREATE TABLE `refresh_sessions` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`family_id` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rotated_at` integer,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_sessions_token_hash_unique` ON `refresh_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_refresh_sessions_expires_at` ON `refresh_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_refresh_sessions_family_id` ON `refresh_sessions` (`family_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_sessions_user_id` ON `refresh_sessions` (`user_id`);--> statement-breakpoint
DROP INDEX `users_refresh_token_hash_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `refresh_token_hash`;