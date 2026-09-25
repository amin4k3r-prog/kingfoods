ALTER TABLE `cards` ADD `document` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `customer` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `charge_type` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `seller` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `balance_display` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cards_document_unique` ON `cards` (`document`);