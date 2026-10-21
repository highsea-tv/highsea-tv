CREATE TABLE `blocklist` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`release_title` text NOT NULL,
	`indexer_id` text,
	`indexer_name` text,
	`guid` text,
	`info_hash` text,
	`quality` text,
	`reason` text NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocklist_item` ON `blocklist` (`item_id`,`date`);--> statement-breakpoint
CREATE INDEX `blocklist_hash` ON `blocklist` (`info_hash`);--> statement-breakpoint
CREATE INDEX `blocklist_date` ON `blocklist` (`date`,`id`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`torrent_id` text,
	`item_id` text NOT NULL,
	`version_id` text,
	`indexer_id` text,
	`indexer_name` text,
	`guid` text,
	`info_hash` text NOT NULL,
	`release_title` text NOT NULL,
	`quality` text,
	`size` integer NOT NULL,
	`release` text NOT NULL,
	`state` text NOT NULL,
	`state_reason` text,
	`progress_at` integer NOT NULL,
	`transfer` text,
	`grabbed_at` integer NOT NULL,
	`imported_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`torrent_id`) REFERENCES `torrents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `downloads_state` ON `downloads` (`state`,`grabbed_at`);--> statement-breakpoint
CREATE INDEX `downloads_item` ON `downloads` (`item_id`,`grabbed_at`);--> statement-breakpoint
CREATE INDEX `downloads_torrent` ON `downloads` (`torrent_id`);--> statement-breakpoint
CREATE INDEX `downloads_hash` ON `downloads` (`info_hash`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`type` text NOT NULL,
	`date` integer NOT NULL,
	`source_title` text NOT NULL,
	`quality` text,
	`indexer` text,
	`message` text,
	`download_id` text,
	`data` text,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `history_item` ON `history` (`item_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `history_date` ON `history` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `history_type` ON `history` (`type`,`date`,`id`);--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`version_id` text,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`quality` text,
	`release_group` text,
	`scene_name` text,
	`edition` text,
	`media_info` text,
	`transfer` text,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_path_unique` ON `media_files` (`path`);--> statement-breakpoint
CREATE INDEX `media_files_item` ON `media_files` (`item_id`);--> statement-breakpoint
CREATE INDEX `media_files_version` ON `media_files` (`version_id`);--> statement-breakpoint
CREATE TABLE `torrent_files` (
	`torrent_id` text NOT NULL,
	`index` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`priority` text NOT NULL,
	PRIMARY KEY(`torrent_id`, `index`),
	FOREIGN KEY (`torrent_id`) REFERENCES `torrents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `torrent_resume` (
	`torrent_id` text PRIMARY KEY NOT NULL,
	`bitfield` blob NOT NULL,
	`files` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`torrent_id`) REFERENCES `torrents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `torrents` (
	`id` text PRIMARY KEY NOT NULL,
	`info_hash` text NOT NULL,
	`name` text NOT NULL,
	`info` blob,
	`trackers` text NOT NULL,
	`magnet` text,
	`save_path` text NOT NULL,
	`category` text NOT NULL,
	`intent` text NOT NULL,
	`error` text,
	`private` integer DEFAULT false NOT NULL,
	`sequential` integer DEFAULT false NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`seed_ratio` real,
	`seed_minutes` integer,
	`min_seed_minutes` integer,
	`uploaded` integer DEFAULT 0 NOT NULL,
	`downloaded` integer DEFAULT 0 NOT NULL,
	`seeding_ms` integer DEFAULT 0 NOT NULL,
	`added_at` integer NOT NULL,
	`completed_at` integer,
	`seeded_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `torrents_info_hash_unique` ON `torrents` (`info_hash`);--> statement-breakpoint
ALTER TABLE `indexers` ADD `seed_ratio` real;--> statement-breakpoint
ALTER TABLE `indexers` ADD `seed_minutes` integer;--> statement-breakpoint
ALTER TABLE `indexers` ADD `min_seed_minutes` integer;--> statement-breakpoint
-- Setup's folders row was `media`; settings.md's `media` area means naming, so it's `folders` now.
UPDATE `settings` SET `key` = 'folders' WHERE `key` = 'media'
  AND NOT EXISTS (SELECT 1 FROM `settings` WHERE `key` = 'folders');
