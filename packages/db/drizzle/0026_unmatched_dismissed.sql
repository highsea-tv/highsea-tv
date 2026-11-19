ALTER TABLE `unmatched_files` ADD `dismissed_at` integer;--> statement-breakpoint
-- HT-92: shows imported before their subtitles were served take their root folder's profile, as
-- an import does now; a show's seasons and episodes hold it with the show
UPDATE `media_items` SET `language_profile_id` = (
	SELECT `root_folders`.`language_profile_id` FROM `root_folders`
	WHERE `root_folders`.`path` = `media_items`.`root_folder`
) WHERE `type` IN ('show', 'season', 'episode') AND `language_profile_id` IS NULL;