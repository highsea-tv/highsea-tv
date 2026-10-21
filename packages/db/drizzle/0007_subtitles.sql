CREATE TABLE `language_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rules` text NOT NULL,
	`cutoff` text,
	`min_score` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `language_profiles_name_unique` ON `language_profiles` (`name`);--> statement-breakpoint
CREATE TABLE `subtitle_downloads` (
	`key` text PRIMARY KEY NOT NULL,
	`link` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtitle_files` (
	`id` text PRIMARY KEY NOT NULL,
	`media_file_id` text NOT NULL,
	`item_id` text NOT NULL,
	`language` text NOT NULL,
	`forced` integer NOT NULL,
	`hi` integer NOT NULL,
	`format` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subtitle_id` text,
	`release_name` text,
	`score` integer NOT NULL,
	`matches` text DEFAULT '[]' NOT NULL,
	`chosen` integer DEFAULT false NOT NULL,
	`original` blob,
	`encoding` text,
	`sync_status` text NOT NULL,
	`sync_confidence` real,
	`sync_ratio` real,
	`sync_offset_ms` integer,
	`sync_splits` text,
	`manual_offset_ms` integer DEFAULT 0 NOT NULL,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subtitle_files_track` ON `subtitle_files` (`media_file_id`,`language`,`forced`,`hi`,`provider`);--> statement-breakpoint
CREATE INDEX `subtitle_files_item` ON `subtitle_files` (`item_id`);--> statement-breakpoint
CREATE INDEX `subtitle_files_sync` ON `subtitle_files` (`sync_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `subtitle_files_created` ON `subtitle_files` (`created_at`);--> statement-breakpoint
CREATE TABLE `subtitle_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`credentials` text,
	`account` text,
	`token` text,
	`token_expires_at` integer,
	`base_url` text,
	`throttled_until` integer,
	`throttle_reason` text,
	`failures` text DEFAULT '[]' NOT NULL,
	`quota_used` integer DEFAULT 0 NOT NULL,
	`quota_limit` integer,
	`quota_resets_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtitle_results` (
	`id` text PRIMARY KEY NOT NULL,
	`media_file_id` text NOT NULL,
	`item_id` text NOT NULL,
	`language` text NOT NULL,
	`provider` text NOT NULL,
	`score` integer NOT NULL,
	`result` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtitle_results_file` ON `subtitle_results` (`media_file_id`,`language`);--> statement-breakpoint
CREATE INDEX `subtitle_results_expires` ON `subtitle_results` (`expires_at`);--> statement-breakpoint
CREATE TABLE `subtitle_wanted` (
	`item_id` text NOT NULL,
	`media_file_id` text NOT NULL,
	`language` text NOT NULL,
	`forced` integer NOT NULL,
	`hi` integer NOT NULL,
	`last_searched_at` integer,
	`next_search_at` integer NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `media_file_id`, `language`, `forced`, `hi`),
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtitle_wanted_next` ON `subtitle_wanted` (`next_search_at`);--> statement-breakpoint
CREATE INDEX `subtitle_wanted_file` ON `subtitle_wanted` (`media_file_id`);