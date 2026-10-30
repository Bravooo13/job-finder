CREATE TABLE `action_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`via` text,
	`action` text NOT NULL,
	`title` text NOT NULL,
	`input` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`result` text,
	`error` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `action_requests_status_idx` ON `action_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`via` text,
	`action` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`detail` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`request_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_log_created_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_log_actor_idx` ON `activity_log` (`actor`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`via` text,
	`feature` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`web_searches` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);