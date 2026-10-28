CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`careers_url` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `companies_name_idx` ON `companies` (lower("name"));--> statement-breakpoint
CREATE TABLE `job_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`company_id` text NOT NULL,
	`location` text,
	`workplace` text,
	`job_type` text,
	`status` text DEFAULT 'new' NOT NULL,
	`source` text,
	`url` text,
	`description` text,
	`salary` text,
	`skills` text,
	`match_score` integer,
	`resume_id` text,
	`posted_at` integer,
	`date_applied` integer,
	`due_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `jobs` (`company_id`);--> statement-breakpoint
CREATE INDEX `jobs_created_idx` ON `jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_url_idx` ON `jobs` (`url`);--> statement-breakpoint
CREATE TABLE `resume_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`section` text NOT NULL,
	`title` text NOT NULL,
	`organization` text,
	`location` text,
	`start_date` text,
	`end_date` text,
	`current` integer DEFAULT false NOT NULL,
	`url` text,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resume_entries_resume_idx` ON `resume_entries` (`resume_id`,`section`);--> statement-breakpoint
CREATE TABLE `resume_skill_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`name` text NOT NULL,
	`skills` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`is_master` integer DEFAULT false NOT NULL,
	`based_on_id` text,
	`target_job_id` text,
	`full_name` text,
	`headline` text,
	`email` text,
	`phone` text,
	`location` text,
	`website` text,
	`linkedin` text,
	`github` text,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
