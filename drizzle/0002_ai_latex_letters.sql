CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `ai_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_messages_thread_idx` ON `ai_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`agent` text NOT NULL,
	`title` text NOT NULL,
	`resume_id` text,
	`job_id` text,
	`cover_letter_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_letter_id`) REFERENCES `cover_letters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_threads_updated_idx` ON `ai_threads` (`updated_at`);--> statement-breakpoint
CREATE INDEX `ai_threads_resume_idx` ON `ai_threads` (`resume_id`);--> statement-breakpoint
CREATE INDEX `ai_threads_letter_idx` ON `ai_threads` (`cover_letter_id`);--> statement-breakpoint
CREATE TABLE `cover_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company` text,
	`role` text,
	`job_id` text,
	`resume_id` text,
	`job_description` text,
	`instructions` text,
	`content` text DEFAULT '' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cover_letters_job_idx` ON `cover_letters` (`job_id`);--> statement-breakpoint
CREATE INDEX `cover_letters_updated_idx` ON `cover_letters` (`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `resumes` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `resumes` ADD `latex` text;