CREATE TABLE `show_dismissals` (
	`user_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`item_id` text NOT NULL,
	`dismissed_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
