CREATE TABLE `season_metadata` (
	`show_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`show_id`, `season_number`),
	FOREIGN KEY (`show_id`) REFERENCES `show_metadata`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `show_details` (
	`item_id` text PRIMARY KEY NOT NULL,
	`season_folders` integer DEFAULT true NOT NULL,
	`tvdb_id` integer,
	`imdb_id` text,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_details_tvdb` ON `show_details` (`tvdb_id`);--> statement-breakpoint
CREATE TABLE `show_metadata` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`original_name` text NOT NULL,
	`year` integer,
	`first_air_date` text,
	`vote_average` real DEFAULT 0 NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`popularity` real DEFAULT 0 NOT NULL,
	`status` text,
	`tvdb_id` integer,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`gone_at` integer
);
--> statement-breakpoint
CREATE INDEX `show_metadata_fetched` ON `show_metadata` (`fetched_at`);--> statement-breakpoint
CREATE INDEX `show_metadata_tvdb` ON `show_metadata` (`tvdb_id`);--> statement-breakpoint
ALTER TABLE `media_items` ADD `show_id` text;--> statement-breakpoint
ALTER TABLE `media_items` ADD `season_number` integer;--> statement-breakpoint
ALTER TABLE `media_items` ADD `episode_number` integer;--> statement-breakpoint
CREATE INDEX `media_items_show` ON `media_items` (`show_id`,`season_number`,`episode_number`) WHERE show_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `versions_file` ON `versions` (`file_id`);