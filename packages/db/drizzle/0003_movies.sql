CREATE TABLE `collections` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`gone_at` integer
);
--> statement-breakpoint
CREATE INDEX `collections_fetched` ON `collections` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `credits` (
	`id` text PRIMARY KEY NOT NULL,
	`movie_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`kind` text NOT NULL,
	`department` text NOT NULL,
	`role` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movie_metadata`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credits_movie` ON `credits` (`movie_id`,`kind`,`order`);--> statement-breakpoint
CREATE INDEX `credits_person` ON `credits` (`person_id`);--> statement-breakpoint
CREATE TABLE `custom_formats` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`trash_id` text,
	`conditions` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_formats_name_unique` ON `custom_formats` (`name`);--> statement-breakpoint
CREATE TABLE `images` (
	`path` text NOT NULL,
	`size` text NOT NULL,
	`kind` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`file` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`path`, `size`)
);
--> statement-breakpoint
CREATE INDEX `images_owner` ON `images` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `media_item_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_item_tags_tag` ON `media_item_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`year` integer,
	`rating` real DEFAULT 0 NOT NULL,
	`release_date` text,
	`status` text NOT NULL,
	`monitored` integer NOT NULL,
	`minimum_availability` text NOT NULL,
	`quality_profile_id` text NOT NULL,
	`language_profile_id` text,
	`root_folder` text NOT NULL,
	`path` text NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_items_provider` ON `media_items` (`type`,`tmdb_id`);--> statement-breakpoint
CREATE INDEX `media_items_parent` ON `media_items` (`parent_id`);--> statement-breakpoint
CREATE INDEX `media_items_title` ON `media_items` (`type`,`sort_title`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_year` ON `media_items` (`type`,`year`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_added` ON `media_items` (`type`,`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_rating` ON `media_items` (`type`,`rating`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_release` ON `media_items` (`type`,`release_date`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_status` ON `media_items` (`type`,`status`,`sort_title`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_profile` ON `media_items` (`type`,`quality_profile_id`,`sort_title`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_monitored` ON `media_items` (`type`,`monitored`,`sort_title`,`id`);--> statement-breakpoint
CREATE INDEX `media_items_profile_status` ON `media_items` (`type`,`quality_profile_id`,`status`);--> statement-breakpoint
CREATE INDEX `media_items_monitored_status` ON `media_items` (`type`,`monitored`,`status`);--> statement-breakpoint
CREATE TABLE `movie_metadata` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`original_title` text NOT NULL,
	`year` integer,
	`release_date` text,
	`vote_average` real DEFAULT 0 NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`popularity` real DEFAULT 0 NOT NULL,
	`collection_id` integer,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`gone_at` integer
);
--> statement-breakpoint
CREATE INDEX `movie_metadata_fetched` ON `movie_metadata` (`fetched_at`);--> statement-breakpoint
CREATE INDEX `movie_metadata_collection` ON `movie_metadata` (`collection_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`gone_at` integer
);
--> statement-breakpoint
CREATE INDEX `people_fetched` ON `people` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `quality_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quality_profiles_name_unique` ON `quality_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `root_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `root_folders_path_unique` ON `root_folders` (`path`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_label_unique` ON `tags` (`label`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`label` text NOT NULL,
	`quality_profile_id` text NOT NULL,
	`file_id` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `versions_item` ON `versions` (`item_id`,`position`);--> statement-breakpoint
CREATE INDEX `versions_profile` ON `versions` (`quality_profile_id`);--> statement-breakpoint
CREATE TABLE `watch_positions` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`position_seconds` integer NOT NULL,
	`duration_seconds` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_positions_recent` ON `watch_positions` (`user_id`,`updated_at`);