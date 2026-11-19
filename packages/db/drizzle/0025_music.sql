CREATE TABLE `music_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`year` integer,
	`released` text,
	`kind` text DEFAULT 'album' NOT NULL,
	`label` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`release_id` text,
	`release_group_id` text,
	`path` text NOT NULL,
	`root_folder` text NOT NULL,
	`cover_file` text,
	`embedded_cover` text,
	`cover_url` text,
	`nfo` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `music_artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_albums_path` ON `music_albums` (`path`);--> statement-breakpoint
CREATE INDEX `music_albums_artist` ON `music_albums` (`artist_id`,`year`);--> statement-breakpoint
CREATE INDEX `music_albums_sort` ON `music_albums` (`sort_title`,`id`);--> statement-breakpoint
CREATE INDEX `music_albums_added` ON `music_albums` (`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `music_albums_root` ON `music_albums` (`root_folder`);--> statement-breakpoint
CREATE TABLE `music_artists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_name` text NOT NULL,
	`name_key` text NOT NULL,
	`musicbrainz_id` text,
	`path` text,
	`root_folder` text NOT NULL,
	`photo_file` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_artists_mbid` ON `music_artists` (`musicbrainz_id`) WHERE musicbrainz_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `music_artists_name` ON `music_artists` (`name_key`);--> statement-breakpoint
CREATE INDEX `music_artists_sort` ON `music_artists` (`sort_name`,`id`);--> statement-breakpoint
CREATE TABLE `musicbrainz_cache` (
	`kind` text NOT NULL,
	`mbid` text NOT NULL,
	`data` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `mbid`)
);
--> statement-breakpoint
CREATE INDEX `musicbrainz_fetched` ON `musicbrainz_cache` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `music_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`disc` integer DEFAULT 1 NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`duration` real DEFAULT 0 NOT NULL,
	`recording_id` text,
	`path` text NOT NULL,
	`disc_folder` text,
	`size` integer NOT NULL,
	`mtime` integer NOT NULL,
	`format` text NOT NULL,
	`codec` text NOT NULL,
	`bitrate` integer DEFAULT 0 NOT NULL,
	`sample_rate` integer DEFAULT 0 NOT NULL,
	`bit_depth` integer,
	`channels` integer DEFAULT 2 NOT NULL,
	`lyrics_file` text,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `music_albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_tracks_path` ON `music_tracks` (`path`);--> statement-breakpoint
CREATE INDEX `music_tracks_album` ON `music_tracks` (`album_id`,`disc`,`number`);--> statement-breakpoint
CREATE TABLE `music_unmatched` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`root_folder` text NOT NULL,
	`reason` text NOT NULL,
	`files` integer NOT NULL,
	`size` integer NOT NULL,
	`guess_artist` text,
	`guess_album` text,
	`guess_year` integer,
	`ignored` integer DEFAULT false NOT NULL,
	`found_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_unmatched_path` ON `music_unmatched` (`path`);--> statement-breakpoint
CREATE INDEX `music_unmatched_root` ON `music_unmatched` (`root_folder`,`ignored`);