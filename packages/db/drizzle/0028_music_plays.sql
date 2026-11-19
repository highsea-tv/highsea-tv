CREATE TABLE `music_matches` (
	`path` text PRIMARY KEY NOT NULL,
	`artist` text NOT NULL,
	`album` text NOT NULL,
	`year` integer,
	`matched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `music_playlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `music_playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `music_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `music_playlist_entries_list` ON `music_playlist_entries` (`playlist_id`,`position`);--> statement-breakpoint
CREATE TABLE `music_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `music_playlists_profile` ON `music_playlists` (`profile_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `music_plays` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text,
	`profile_name` text,
	`track_id` text,
	`album_id` text,
	`artist_id` text,
	`title` text NOT NULL,
	`artist_name` text NOT NULL,
	`album_title` text NOT NULL,
	`year` integer,
	`device_name` text NOT NULL,
	`client` text NOT NULL,
	`version` text NOT NULL,
	`method` text NOT NULL,
	`away` integer NOT NULL,
	`played` integer NOT NULL,
	`finished` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`track_id`) REFERENCES `music_tracks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`album_id`) REFERENCES `music_albums`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`artist_id`) REFERENCES `music_artists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `music_plays_ended` ON `music_plays` (`ended_at`);--> statement-breakpoint
CREATE INDEX `music_plays_user` ON `music_plays` (`user_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `music_plays_track` ON `music_plays` (`track_id`);--> statement-breakpoint
CREATE INDEX `music_plays_profile` ON `music_plays` (`profile_id`,`ended_at`);--> statement-breakpoint
CREATE TABLE `music_recent` (
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`played_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `kind`, `target_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `music_recent_profile` ON `music_recent` (`profile_id`,`played_at`);--> statement-breakpoint
ALTER TABLE `music_artists` ADD `photo_url` text;