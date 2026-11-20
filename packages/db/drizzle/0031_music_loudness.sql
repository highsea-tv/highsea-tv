CREATE TABLE `music_loudness` (
	`track_id` text PRIMARY KEY NOT NULL,
	`file` text NOT NULL,
	`source` text NOT NULL,
	`track_lufs` real NOT NULL,
	`track_peak` real NOT NULL,
	`album_lufs` real,
	`album_peak` real,
	`envelope` text DEFAULT '[]' NOT NULL,
	`measured_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `music_tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
