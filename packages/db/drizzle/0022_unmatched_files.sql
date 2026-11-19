CREATE TABLE `unmatched_files` (
	`path` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`root_folder` text NOT NULL,
	`item_id` text,
	`reason` text NOT NULL,
	`message` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`found_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `unmatched_files_root` ON `unmatched_files` (`root_folder`,`kind`);--> statement-breakpoint
CREATE INDEX `unmatched_files_item` ON `unmatched_files` (`item_id`);