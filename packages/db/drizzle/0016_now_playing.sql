CREATE TABLE `playback_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_name` text NOT NULL,
	`client` text NOT NULL,
	`item_id` text,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`version` text NOT NULL,
	`method` text NOT NULL,
	`away` integer NOT NULL,
	`watched` integer NOT NULL,
	`finished` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `playback_history_ended` ON `playback_history` (`ended_at`);--> statement-breakpoint
CREATE INDEX `playback_history_user` ON `playback_history` (`user_id`,`ended_at`);