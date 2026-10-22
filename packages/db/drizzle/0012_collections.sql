CREATE TABLE `smart_collection_items` (
	`collection_id` text NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `item_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `smart_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `smart_collection_items_item` ON `smart_collection_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `smart_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`artwork` text,
	`rules` text,
	`sort` text NOT NULL,
	`descending` integer NOT NULL,
	`limit` integer,
	`audience` text NOT NULL,
	`position` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `media_file_languages` (
	`file_id` text NOT NULL,
	`kind` text NOT NULL,
	`language` text NOT NULL,
	PRIMARY KEY(`file_id`, `kind`, `language`),
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_file_languages_language` ON `media_file_languages` (`kind`,`language`);--> statement-breakpoint
CREATE TABLE `movie_terms` (
	`movie_id` integer NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`movie_id`, `kind`, `value`),
	FOREIGN KEY (`movie_id`) REFERENCES `movie_metadata`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `movie_terms_value` ON `movie_terms` (`kind`,`value`);--> statement-breakpoint
ALTER TABLE `media_files` ADD `resolution` integer;--> statement-breakpoint
ALTER TABLE `media_files` ADD `hdr` text;--> statement-breakpoint
ALTER TABLE `media_files` ADD `video_codec` text;--> statement-breakpoint
ALTER TABLE `movie_metadata` ADD `original_language` text;--> statement-breakpoint
ALTER TABLE `movie_metadata` ADD `runtime` integer;--> statement-breakpoint
ALTER TABLE `movie_metadata` ADD `certification` text;--> statement-breakpoint
CREATE INDEX `movie_metadata_language` ON `movie_metadata` (`original_language`);