ALTER TABLE `jobs` ADD `subject` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `subject_of` text;--> statement-breakpoint
CREATE INDEX `jobs_subject_of` ON `jobs` (`subject_of`,`status`);