CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`tax_id` text NOT NULL,
	`name` text NOT NULL,
	`payer_name` text NOT NULL,
	`phone` text NOT NULL,
	`payer_contact` text NOT NULL,
	`delivery_address` text NOT NULL,
	`address_confirmed` integer DEFAULT 0 NOT NULL,
	`photo_key` text,
	`risk_class` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_tax_id_unique` ON `customers` (`tax_id`);--> statement-breakpoint
CREATE TABLE `title_events` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`event_type` text NOT NULL,
	`stage` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_title_events_card_created` ON `title_events` (`card_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cards` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `cards` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `policy_stage` text;--> statement-breakpoint
CREATE INDEX `idx_cards_customer_active` ON `cards` (`customer_id`,`archived_at`);