CREATE TABLE `apply_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`job_id` text,
	`found_id` text,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`summary` text,
	`needs` text NOT NULL,
	`checks` text NOT NULL,
	`answers` text NOT NULL,
	`by` text DEFAULT 'you' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`found_id`) REFERENCES `discovered_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `apply_tasks_status_idx` ON `apply_tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `apply_tasks_batch_idx` ON `apply_tasks` (`batch_id`);--> statement-breakpoint
CREATE INDEX `apply_tasks_job_idx` ON `apply_tasks` (`job_id`);