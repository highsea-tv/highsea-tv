CREATE TABLE `device_profiles` (
	`device_id` text PRIMARY KEY NOT NULL,
	`base` text NOT NULL,
	`report` text NOT NULL,
	`reported_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playback_prefs` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`version_id` text,
	`audio_id` text,
	`subtitle_id` text,
	`subtitle_offset_ms` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watch_history` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`played` integer NOT NULL,
	`play_count` integer NOT NULL,
	`last_played_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_history_last` ON `watch_history` (`user_id`,`last_played_at`);