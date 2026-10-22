CREATE TABLE `rss_seen` (
	`indexer_id` text NOT NULL,
	`guid` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`indexer_id`, `guid`),
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rss_seen_at` ON `rss_seen` (`seen_at`);--> statement-breakpoint
CREATE TABLE `import_list_exclusions` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_list_items` (
	`list_id` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`list_id`, `tmdb_id`),
	FOREIGN KEY (`list_id`) REFERENCES `import_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_list_items_tmdb` ON `import_list_items` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `import_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	`settings` text NOT NULL,
	`root_folder` text NOT NULL,
	`quality_profile_id` text NOT NULL,
	`language_profile_id` text,
	`monitored` integer NOT NULL,
	`minimum_availability` text NOT NULL,
	`search_on_add` integer NOT NULL,
	`last_sync_at` integer,
	`last_result` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD `secret_sealed` text;--> statement-breakpoint
ALTER TABLE `media_items` ADD `digital_release` text;--> statement-breakpoint
ALTER TABLE `media_items` ADD `physical_release` text;--> statement-breakpoint
ALTER TABLE `media_items` ADD `cutoff_unmet` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `media_items` ADD `next_search_at` integer;--> statement-breakpoint
ALTER TABLE `media_items` ADD `searches` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `media_items_cutoff` ON `media_items` (`type`,`cutoff_unmet`,`sort_title`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_wanted` ON `media_items` (`type`,`next_search_at`) WHERE monitored = 1 AND (status = 'wanted' OR cutoff_unmet = 1);--> statement-breakpoint
CREATE INDEX `media_items_digital` ON `media_items` (`type`,`digital_release`);--> statement-breakpoint
CREATE INDEX `media_items_physical` ON `media_items` (`type`,`physical_release`);