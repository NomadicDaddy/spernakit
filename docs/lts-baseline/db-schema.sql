-- Spernakit v3.13.0-lts database schema baseline
-- Captured: 2026-05-05T16:18:33.129Z

CREATE UNIQUE INDEX `api_key_nonces_nonce_unique` ON `api_key_nonces` (`nonce`);

CREATE UNIQUE INDEX `api_keys_key_index_hash_unique` ON `api_keys` (`key_index_hash`);

CREATE UNIQUE INDEX `email_change_tokens_token_hash_unique` ON `email_change_tokens` (`token_hash`);

CREATE UNIQUE INDEX `file_uploads_storage_path_unique` ON `file_uploads` (`storage_path`);

CREATE INDEX `idx_api_key_nonces_expires_at` ON `api_key_nonces` (`expires_at`);

CREATE INDEX `idx_api_keys_created_by` ON `api_keys` (`created_by`);

CREATE INDEX `idx_api_keys_expires_at` ON `api_keys` (`expires_at`);

CREATE INDEX `idx_api_keys_is_active` ON `api_keys` (`is_active`);

CREATE UNIQUE INDEX `idx_api_keys_user_key_name` ON `api_keys` (`created_by`,`key_name`);

CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`);

CREATE INDEX `idx_audit_logs_created_at` ON `audit_logs` (`created_at`);

CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`entity_type`,`entity_id`);

CREATE INDEX `idx_audit_logs_user_id` ON `audit_logs` (`user_id`);

CREATE INDEX `idx_audit_logs_workspace_created` ON `audit_logs` (`workspace_id`,`created_at`);

CREATE INDEX `idx_audit_logs_workspace_id` ON `audit_logs` (`workspace_id`);

CREATE INDEX `idx_bug_reports_created_at` ON `bug_reports` (`created_at`);

CREATE INDEX `idx_bug_reports_status` ON `bug_reports` (`status`);

CREATE INDEX `idx_bug_reports_user_id` ON `bug_reports` (`user_id`);

CREATE INDEX `idx_business_events_category_created` ON `business_events` (`event_category`,`created_at`);

CREATE INDEX `idx_business_events_created_at` ON `business_events` (`created_at`);

CREATE INDEX `idx_business_events_name_created` ON `business_events` (`event_name`,`created_at`);

CREATE INDEX `idx_business_events_user_created` ON `business_events` (`user_id`,`created_at`);

CREATE INDEX `idx_business_events_user_id` ON `business_events` (`user_id`);

CREATE INDEX `idx_dashboard_configs_is_deleted` ON `dashboard_configs` (`is_deleted`);

CREATE UNIQUE INDEX `idx_dashboard_configs_share_token` ON `dashboard_configs` (`share_token`);

CREATE INDEX `idx_dashboard_configs_user_id` ON `dashboard_configs` (`user_id`);

CREATE INDEX `idx_dashboard_configs_user_id_is_deleted` ON `dashboard_configs` (`user_id`,`is_deleted`);

CREATE INDEX `idx_dashboard_configs_workspace_id` ON `dashboard_configs` (`workspace_id`);

CREATE INDEX `idx_dashboard_configs_workspace_id_user_id` ON `dashboard_configs` (`workspace_id`,`user_id`);

CREATE INDEX `idx_dashboard_widgets_dashboard_id` ON `dashboard_widgets` (`dashboard_id`);

CREATE INDEX `idx_dashboard_widgets_dashboard_id_is_deleted` ON `dashboard_widgets` (`dashboard_id`,`is_deleted`);

CREATE INDEX `idx_dashboard_widgets_is_deleted` ON `dashboard_widgets` (`is_deleted`);

CREATE INDEX `idx_email_change_tokens_expires_at` ON `email_change_tokens` (`expires_at`);

CREATE INDEX `idx_email_change_tokens_user_id` ON `email_change_tokens` (`user_id`);

CREATE INDEX `idx_file_uploads_is_deleted_deleted_at` ON `file_uploads` (`is_deleted`,`deleted_at`);

CREATE INDEX `idx_file_uploads_uploaded_by` ON `file_uploads` (`uploaded_by`);

CREATE INDEX `idx_file_uploads_workspace_id` ON `file_uploads` (`workspace_id`);

CREATE INDEX `idx_file_uploads_workspace_id_is_deleted` ON `file_uploads` (`workspace_id`,`is_deleted`);

CREATE INDEX `idx_health_check_alerts_check_resolved_created` ON `health_check_alerts` (`check_type`,`resolved_at`,`created_at`);

CREATE INDEX `idx_health_check_alerts_check_type` ON `health_check_alerts` (`check_type`);

CREATE INDEX `idx_health_check_alerts_resolved_at` ON `health_check_alerts` (`resolved_at`);

CREATE INDEX `idx_health_check_alerts_resolved_created` ON `health_check_alerts` (`resolved_at`,`created_at`);

CREATE INDEX `idx_health_check_alerts_severity` ON `health_check_alerts` (`severity`);

CREATE INDEX `idx_health_check_logs_check_type` ON `health_check_logs` (`check_type`);

CREATE INDEX `idx_health_check_logs_created_at` ON `health_check_logs` (`created_at`);

CREATE INDEX `idx_health_check_logs_status` ON `health_check_logs` (`status`);

CREATE INDEX `idx_notifications_is_deleted` ON `notifications` (`is_deleted`);

CREATE INDEX `idx_notifications_type` ON `notifications` (`type`);

CREATE INDEX `idx_notifications_user_deleted_created` ON `notifications` (`user_id`,`is_deleted`,`created_at`);

CREATE INDEX `idx_notifications_user_id` ON `notifications` (`user_id`);

CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`,`read_at`);

CREATE INDEX `idx_notifications_user_workspace_deleted_created` ON `notifications` (`user_id`,`workspace_id`,`is_deleted`,`created_at`);

CREATE INDEX `idx_oauth_accounts_is_deleted` ON `oauth_accounts` (`is_deleted`);

CREATE UNIQUE INDEX `idx_oauth_accounts_provider_account` ON `oauth_accounts` (`provider`,`provider_account_id`);

CREATE INDEX `idx_oauth_accounts_user_id` ON `oauth_accounts` (`user_id`);

CREATE UNIQUE INDEX `idx_oauth_accounts_user_provider` ON `oauth_accounts` (`user_id`,`provider`);

CREATE INDEX `idx_password_history_created_at` ON `password_history` (`created_at`);

CREATE UNIQUE INDEX `idx_password_history_user_hash` ON `password_history` (`user_id`,`password_hash`);

CREATE INDEX `idx_password_history_user_id` ON `password_history` (`user_id`);

CREATE INDEX `idx_pkce_verifiers_expires_at` ON `pkce_verifiers` (`expires_at`);

CREATE UNIQUE INDEX `idx_pkce_verifiers_state` ON `pkce_verifiers` (`state`);

CREATE INDEX `idx_rate_limit_entries_reset_at` ON `rate_limit_entries` (`reset_at`);

CREATE UNIQUE INDEX `idx_scheduled_task_configs_task_name` ON `scheduled_task_configs` (`task_name`);

CREATE INDEX `idx_scheduled_task_executions_created_at` ON `scheduled_task_executions` (`created_at`);

CREATE INDEX `idx_scheduled_task_executions_name_created` ON `scheduled_task_executions` (`task_name`,`created_at`);

CREATE INDEX `idx_scheduled_task_executions_status` ON `scheduled_task_executions` (`status`);

CREATE INDEX `idx_scheduled_task_executions_task_name` ON `scheduled_task_executions` (`task_name`);

CREATE INDEX `idx_settings_key_is_deleted` ON `settings` (`key`,`is_deleted`);

CREATE INDEX `idx_system_metrics_created_at` ON `system_metrics` (`created_at`);

CREATE INDEX `idx_system_metrics_metric_type` ON `system_metrics` (`metric_type`);

CREATE INDEX `idx_system_metrics_type_created` ON `system_metrics` (`metric_type`,`created_at`);

CREATE INDEX `idx_token_blacklist_expires_at` ON `token_blacklist` (`expires_at`);

CREATE INDEX `idx_token_blacklist_user_id` ON `token_blacklist` (`user_id`);

CREATE INDEX `idx_users_email_is_deleted` ON `users` (`email`,`is_deleted`);

CREATE INDEX `idx_users_is_deleted` ON `users` (`is_deleted`);

CREATE INDEX `idx_users_role` ON `users` (`role`);

CREATE INDEX `idx_users_username_is_deleted` ON `users` (`username`,`is_deleted`);

CREATE INDEX `idx_workspace_members_user_id` ON `workspace_members` (`user_id`);

CREATE INDEX `idx_workspace_members_workspace_id` ON `workspace_members` (`workspace_id`);

CREATE UNIQUE INDEX `idx_workspace_members_workspace_user` ON `workspace_members` (`workspace_id`,`user_id`);

CREATE UNIQUE INDEX `idx_workspaces_is_default_active` ON `workspaces` (`is_default`) WHERE "workspaces"."is_default" = 1 AND "workspaces"."is_deleted" = 0;

CREATE INDEX `idx_workspaces_is_deleted` ON `workspaces` (`is_deleted`);

CREATE INDEX `idx_workspaces_owner_id` ON `workspaces` (`owner_id`);

CREATE INDEX `idx_workspaces_slug_is_deleted` ON `workspaces` (`slug`,`is_deleted`);

CREATE UNIQUE INDEX `mfa_settings_user_id_unique` ON `mfa_settings` (`user_id`);

CREATE UNIQUE INDEX `rate_limit_entries_key_unique` ON `rate_limit_entries` (`key`);

CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);

CREATE UNIQUE INDEX `token_blacklist_token_hash_unique` ON `token_blacklist` (`token_hash`);

CREATE UNIQUE INDEX `user_notification_preferences_user_id_unique` ON `user_notification_preferences` (`user_id`);

CREATE UNIQUE INDEX `users_csrf_token_unique` ON `users` (`csrf_token`);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE UNIQUE INDEX `users_email_verification_token_unique` ON `users` (`email_verification_token`);

CREATE UNIQUE INDEX `users_refresh_token_hash_unique` ON `users` (`refresh_token_hash`);

CREATE UNIQUE INDEX `users_reset_token_unique` ON `users` (`reset_token`);

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);

CREATE TABLE `api_key_nonces` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nonce` text NOT NULL
);

CREATE TABLE `api_keys` (
	`created_at` integer NOT NULL,
	`created_by` integer NOT NULL,
	`expires_at` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`key_hash` text NOT NULL,
	`key_index_hash` text NOT NULL,
	`key_name` text NOT NULL,
	`key_scope` text DEFAULT 'read' NOT NULL,
	`key_secret` text,
	`last_used_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `audit_logs` (
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	`details` text,
	`entity_id` text,
	`entity_type` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_address` text,
	`user_id` integer,
	`workspace_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `bug_reports` (
	`created_at` integer NOT NULL,
	`description` text NOT NULL,
	`email` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text DEFAULT 'bug' NOT NULL,
	`metadata` text,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `business_events` (
	`created_at` integer NOT NULL,
	`event_category` text NOT NULL,
	`event_name` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metadata` text,
	`user_id` integer,
	`workspace_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `dashboard_configs` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`deleted_at` integer,
	`deleted_by` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`share_expires_at` integer,
	`share_token` text,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`user_id` integer NOT NULL,
	`workspace_id` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `dashboard_widgets` (
	`col` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` integer,
	`dashboard_id` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`height` integer DEFAULT 2 NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`metric_type` text NOT NULL,
	`options` text,
	`refresh_interval` integer DEFAULT 60 NOT NULL,
	`row` integer DEFAULT 0 NOT NULL,
	`time_range` text DEFAULT '6h' NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`widget_type` text NOT NULL,
	`width` integer DEFAULT 4 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboard_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `email_change_tokens` (
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`new_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `file_uploads` (
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`filename` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`mime_type` text NOT NULL,
	`original_name` text NOT NULL,
	`size` integer NOT NULL,
	`storage_path` text NOT NULL,
	`thumbnail_key` text,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`uploaded_by` integer,
	`workspace_id` integer,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `health_check_alerts` (
	`acknowledged_at` integer,
	`acknowledged_by` integer,
	`check_type` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message` text NOT NULL,
	`resolved_at` integer,
	`severity` text NOT NULL,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `health_check_logs` (
	`check_type` text NOT NULL,
	`created_at` integer NOT NULL,
	`details` text,
	`duration_ms` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL
);

CREATE TABLE `mfa_settings` (
	`backup_codes_encrypted` text,
	`created_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`last_verified_at` integer,
	`method` text DEFAULT 'totp' NOT NULL,
	`secret_encrypted` text NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `notifications` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`deleted_at` integer,
	`deleted_by` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`read_at` integer,
	`title` text NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`user_id` integer NOT NULL,
	`workspace_id` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `oauth_accounts` (
	`access_token_encrypted` text,
	`access_token_iv` text,
	`access_token_salt` text,
	`created_at` integer NOT NULL,
	`created_by` integer,
	`deleted_at` integer,
	`deleted_by` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`profile` text,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token_encrypted` text,
	`refresh_token_iv` text,
	`refresh_token_salt` text,
	`token_expires_at` integer,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `password_history` (
	`created_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`password_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `pkce_verifiers` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state` text NOT NULL,
	`verifier` text NOT NULL
);

CREATE TABLE `rate_limit_entries` (
	`count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`reset_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `scheduled_task_configs` (
	`cron_expression` text NOT NULL,
	`enabled` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_name` text NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `scheduled_task_executions` (
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`duration_ms` integer,
	`error` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result` text,
	`started_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`task_name` text NOT NULL
);

CREATE TABLE `settings` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`deleted_at` integer,
	`deleted_by` integer,
	`description` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`is_encrypted` integer DEFAULT false NOT NULL,
	`key` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`value` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `system_metrics` (
	`cpu_usage` real,
	`created_at` integer NOT NULL,
	`disk_usage` real,
	`event_loop_latency` real,
	`heap_total` integer,
	`heap_used` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_usage` real,
	`metadata` text,
	`metric_type` text NOT NULL,
	`rss` integer,
	`value` real
);

CREATE TABLE `token_blacklist` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `user_notification_preferences` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preferences` text,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `users` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`csrf_token` text,
	`deleted_at` integer,
	`deleted_by` integer,
	`email` text NOT NULL,
	`email_verification_expires_at` integer,
	`email_verification_token` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`failed_login_attempts` integer DEFAULT 0 NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`last_login_ip` text,
	`locked_until` integer,
	`password_changed_at` integer,
	`password_hash` text NOT NULL,
	`refresh_token_hash` text,
	`requires_password_change` integer DEFAULT false NOT NULL,
	`reset_token` text,
	`reset_token_expires_at` integer,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`username` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `workspace_members` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`joined_at` integer NOT NULL,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	`user_id` integer NOT NULL,
	`workspace_id` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `workspaces` (
	`created_at` integer NOT NULL,
	`created_by` integer,
	`deleted_at` integer,
	`deleted_by` integer,
	`description` text,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`owner_id` integer NOT NULL,
	`settings` text,
	`slug` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
