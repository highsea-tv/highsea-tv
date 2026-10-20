CREATE TABLE `home_layouts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`order` text NOT NULL,
	`hidden` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`device_id` text,
	`values` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `scope`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preferences_device` ON `preferences` (`device_id`);--> statement-breakpoint
CREATE TABLE `sound_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`recipe` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base` text NOT NULL,
	`accent` text NOT NULL,
	`colors` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`data` blob NOT NULL,
	`hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `widget_layouts` (
	`scope` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`role` text,
	`widgets` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `widget_layouts_user` ON `widget_layouts` (`user_id`);