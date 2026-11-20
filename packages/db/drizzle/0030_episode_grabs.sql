-- HT-103 (Phase 5 C1): a show's interactive search results, apart from the films', and the episodes
-- a show's download brings. Both only add: films' downloads keep a null episode_ids.
CREATE TABLE `show_releases` (
	`show_tmdb_id` integer NOT NULL,
	`scope` text NOT NULL,
	`indexer_id` text NOT NULL,
	`guid` text NOT NULL,
	`data` text NOT NULL,
	`download` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`show_tmdb_id`, `scope`, `indexer_id`, `guid`),
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_releases_expires` ON `show_releases` (`expires_at`);--> statement-breakpoint
ALTER TABLE `downloads` ADD `episode_ids` text;