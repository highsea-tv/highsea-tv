CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`type` text NOT NULL,
	`attempt` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`outcome` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `job_runs_by_type` ON `job_runs` (`type`,`started_at`);--> statement-breakpoint
CREATE INDEX `job_runs_by_job` ON `job_runs` (`job_id`);--> statement-breakpoint
CREATE TABLE `job_schedules` (
	`type` text PRIMARY KEY NOT NULL,
	`every_ms` integer NOT NULL,
	`next_run_at` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`dedupe_key` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`run_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_due` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `jobs_dedupe` ON `jobs` (`type`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_finished` ON `jobs` (`finished_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
