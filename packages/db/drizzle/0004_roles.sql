-- Owner, Admin and User (ADR 0032). Written by hand: role and permission enums are TypeScript-only
-- in SQLite, so drizzle-kit has no schema change to generate. Every statement is safe to repeat.
-- Members and restricted accounts, and pending invites for them, become users; their library
-- choices stay as they are.
UPDATE `users` SET `role` = 'user' WHERE `role` IN ('member', 'restricted');
--> statement-breakpoint
-- Staff hold every power by their role; a user keeps only Ask for titles and Download for offline.
DELETE FROM `user_permissions`
WHERE `permission` NOT IN ('request', 'download')
   OR `user_id` IN (SELECT `id` FROM `users` WHERE `role` IN ('owner', 'admin'));
--> statement-breakpoint
-- Staff see every library, now and later ('*').
DELETE FROM `library_access`
WHERE `library` <> '*' AND `user_id` IN (SELECT `id` FROM `users` WHERE `role` IN ('owner', 'admin'));
--> statement-breakpoint
INSERT OR IGNORE INTO `library_access` (`user_id`, `library`)
SELECT `id`, '*' FROM `users` WHERE `role` IN ('owner', 'admin');
--> statement-breakpoint
-- The members' dashboard is gone with them.
DELETE FROM `widget_layouts` WHERE `scope` IN ('role:member', 'role:restricted');
--> statement-breakpoint
-- The two-step policy becomes one switch for the owner and admins: "everyone" and "staff" are on,
-- "optional" is off.
UPDATE `settings`
SET `value` = json_set(`value`, '$.twoFactor',
  json(CASE json_extract(`value`, '$.twoFactor') WHEN 'optional' THEN 'false' ELSE 'true' END))
WHERE `key` = 'security' AND json_type(`value`, '$.twoFactor') = 'text';
--> statement-breakpoint
-- New servers start with the switch on. A server set up before it keeps what it had: off.
INSERT INTO `settings` (`key`, `value`, `updated_at`)
SELECT 'security', '{"twoFactor":false}', CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM `users` WHERE `role` = 'owner')
  AND NOT EXISTS (SELECT 1 FROM `settings` WHERE `key` = 'security');
