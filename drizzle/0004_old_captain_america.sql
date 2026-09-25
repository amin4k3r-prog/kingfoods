ALTER TABLE `customers` ADD `customer_code` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `seller_name` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `last_sale_date` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `address` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `city` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `category` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `credit_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `customers` SET `customer_code` = 'LEGACY-' || substr(`id`,1,24) WHERE `customer_code` IS NULL OR trim(`customer_code`) = '';--> statement-breakpoint
UPDATE `cards` SET `document` = 'LEGACY-' || `id` WHERE `kind`='title' AND (`document` IS NULL OR trim(`document`) = '');--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_code_unique` ON `customers` (`customer_code`);