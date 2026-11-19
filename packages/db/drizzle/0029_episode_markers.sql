CREATE TABLE `episode_markers` (
	`file_id` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`intro_start` real,
	`intro_end` real,
	`intro_source` text,
	`credits` real,
	`credits_source` text,
	`error` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
