CREATE TABLE `fanart_images` (
	`subject` text NOT NULL,
	`external_id` text NOT NULL,
	`data` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`subject`, `external_id`)
);
