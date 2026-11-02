ALTER TABLE `apply_tasks` ADD `check_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `apply_tasks` ADD `submit_pressed_at` integer;--> statement-breakpoint
ALTER TABLE `apply_tasks` ADD `page_note` text;