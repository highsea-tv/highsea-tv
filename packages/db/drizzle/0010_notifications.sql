CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	`events` text NOT NULL,
	`settings` text NOT NULL,
	`server_mail` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_message` ON `notification_log` (`connection_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `notification_log_created` ON `notification_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `web_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_push_endpoint` ON `web_push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `web_push_user` ON `web_push_subscriptions` (`user_id`);