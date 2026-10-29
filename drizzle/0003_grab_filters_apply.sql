CREATE TABLE `apply_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `apply_answers_job_idx` ON `apply_answers` (`job_id`);--> statement-breakpoint
CREATE TABLE `grab_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`page_url` text,
	`by` text DEFAULT 'extension' NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`added` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`boards_learned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `h1b_employers` (
	`name_key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`fiscal_year` integer NOT NULL,
	`initial_approvals` integer DEFAULT 0 NOT NULL,
	`total_approvals` integer DEFAULT 0 NOT NULL,
	`denials` integer DEFAULT 0 NOT NULL,
	`naics` text,
	`state` text,
	`city` text
);
--> statement-breakpoint
ALTER TABLE `company_boards` ADD `origin` text DEFAULT 'you' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `role_type` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `visa` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `visa_note` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `level` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `state` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `company_key` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `class_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `source_industry` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `apply_url` text;--> statement-breakpoint
ALTER TABLE `discovered_jobs` ADD `grabbed` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `discovered_company_key_idx` ON `discovered_jobs` (`company_key`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `role_type` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `visa` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `visa_note` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `apply_url` text;--> statement-breakpoint
UPDATE `searches` SET `sources` = json_insert(`sources`, '$[#]', 'simplify') WHERE `sources` NOT LIKE '%simplify%';--> statement-breakpoint
UPDATE `searches` SET `sources` = json_insert(`sources`, '$[#]', 'smartrecruiters') WHERE `sources` NOT LIKE '%smartrecruiters%';
