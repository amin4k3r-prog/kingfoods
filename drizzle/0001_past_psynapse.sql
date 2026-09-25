ALTER TABLE `cards` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `manual_lane` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `manual_date` text;