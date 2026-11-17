DROP INDEX `idx_api_keys_user_key_name`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_keys_user_key_name` ON `api_keys` (`created_by`,`key_name`) WHERE "api_keys"."is_active" = 1;