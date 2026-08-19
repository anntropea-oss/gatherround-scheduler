ALTER TABLE `polls` ADD `organizer_key_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_polls_organizer_key_hash` ON `polls` (`organizer_key_hash`);