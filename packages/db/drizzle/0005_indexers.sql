CREATE TABLE `catalog_definitions` (
	`origin` text NOT NULL,
	`id` text NOT NULL,
	`version` text NOT NULL,
	`kind` text NOT NULL,
	`definition` text NOT NULL,
	`author` text NOT NULL,
	`license` text NOT NULL,
	`logo` text,
	`catalog_version` text,
	`channel` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`origin`, `id`)
);
--> statement-breakpoint
CREATE TABLE `indexer_stats` (
	`indexer_id` text NOT NULL,
	`hour` integer NOT NULL,
	`queries` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`response_ms` integer DEFAULT 0 NOT NULL,
	`grabs` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`indexer_id`, `hour`),
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `indexer_stats_hour` ON `indexer_stats` (`hour`);--> statement-breakpoint
CREATE TABLE `indexer_status` (
	`indexer_id` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`failing_since` integer,
	`backoff_until` integer,
	`last_error` text,
	`auth_failed` integer DEFAULT false NOT NULL,
	`last_success_at` integer,
	`last_failure_at` integer,
	`session` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `indexers` (
	`id` text PRIMARY KEY NOT NULL,
	`definition_id` text NOT NULL,
	`definition_version` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer NOT NULL,
	`priority` integer NOT NULL,
	`settings` text NOT NULL,
	`needs_attention` integer DEFAULT false NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `indexers_definition` ON `indexers` (`definition_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`tmdb_id` integer NOT NULL,
	`indexer_id` text NOT NULL,
	`guid` text NOT NULL,
	`data` text NOT NULL,
	`download` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`tmdb_id`, `indexer_id`, `guid`),
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `releases_expires` ON `releases` (`expires_at`);