CREATE TABLE `artwork` (
	`owner_type` text NOT NULL,
	`owner_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`file` text NOT NULL,
	`language` text,
	`width` integer,
	`height` integer,
	`data` blob,
	`content_type` text,
	`chosen_by` text,
	`chosen_at` integer NOT NULL,
	PRIMARY KEY(`owner_type`, `owner_id`, `kind`),
	FOREIGN KEY (`chosen_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `artwork_file` ON `artwork` (`file`);