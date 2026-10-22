CREATE TABLE `announcement_seen` (
	`announcement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seen_at` integer NOT NULL,
	`acknowledged_at` integer,
	PRIMARY KEY(`announcement_id`, `user_id`),
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`image` text,
	`cta` text,
	`severity` text NOT NULL,
	`placements` text NOT NULL,
	`audience` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`acknowledgement` text NOT NULL,
	`draft` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `announcements_start_idx` ON `announcements` (`start_at`);--> statement-breakpoint
CREATE TABLE `featured_overrides` (
	`section_id` text NOT NULL,
	`item_id` text NOT NULL,
	`artwork` text,
	`tagline` text,
	PRIMARY KEY(`section_id`, `item_id`),
	FOREIGN KEY (`section_id`) REFERENCES `featured_sections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `featured_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`tagline` text,
	`layout` text NOT NULL,
	`source` text NOT NULL,
	`audience` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `indexers` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_lists` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_formats` ADD `edited` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_profiles` ADD `built_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `root_folders` ADD `language_profile_id` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `tags` text DEFAULT '[]' NOT NULL;