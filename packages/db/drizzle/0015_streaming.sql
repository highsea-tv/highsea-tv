CREATE TABLE `file_keyframes` (
	`file_id` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`times` text NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trickplay` (
	`file_id` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`manifest` text,
	`error` text,
	`made_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
