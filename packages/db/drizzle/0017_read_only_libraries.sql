ALTER TABLE `root_folders` ADD `kind` text DEFAULT 'movies' NOT NULL;--> statement-breakpoint
ALTER TABLE `root_folders` ADD `read_only` integer DEFAULT false NOT NULL;