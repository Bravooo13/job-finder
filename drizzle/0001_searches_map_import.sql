CREATE TABLE `company_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`host` text,
	`site` text DEFAULT '' NOT NULL,
	`careers_url` text,
	`job_count` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_boards_key_idx` ON `company_boards` (`provider`,`token`,`site`);--> statement-breakpoint
CREATE TABLE `discovered_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`search_id` text,
	`url` text NOT NULL,
	`provider` text NOT NULL,
	`board_token` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`workplace` text,
	`job_type` text,
	`salary` text,
	`description` text,
	`posted_at` integer,
	`score` integer DEFAULT 0 NOT NULL,
	`reasons` text NOT NULL,
	`flags` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`job_id` text,
	`lat` real,
	`lng` real,
	`place` text,
	`remote` integer DEFAULT false NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovered_url_idx` ON `discovered_jobs` (`url`);--> statement-breakpoint
CREATE INDEX `discovered_status_idx` ON `discovered_jobs` (`status`,`score`);--> statement-breakpoint
CREATE INDEX `discovered_search_idx` ON `discovered_jobs` (`search_id`);--> statement-breakpoint
CREATE TABLE `search_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`search_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`boards_total` integer DEFAULT 0 NOT NULL,
	`boards_done` integer DEFAULT 0 NOT NULL,
	`postings_seen` integer DEFAULT 0 NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	`new_jobs` integer DEFAULT 0 NOT NULL,
	`errors` text NOT NULL,
	`message` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_runs_search_idx` ON `search_runs` (`search_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `searches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`titles` text NOT NULL,
	`keywords` text NOT NULL,
	`exclude_words` text NOT NULL,
	`locations` text NOT NULL,
	`include_remote` integer DEFAULT true NOT NULL,
	`levels` text NOT NULL,
	`sources` text NOT NULL,
	`company_scope` text DEFAULT 'all' NOT NULL,
	`resume_id` text,
	`min_score` integer DEFAULT 45 NOT NULL,
	`schedule_hour` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `jobs` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `jobs` ADD `place` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `remote` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `resumes` ADD `source_text` text;