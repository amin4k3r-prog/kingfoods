CREATE TABLE `analysis_events` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`analysis_id` text,
	`event_type` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`responsible` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_analysis_events_customer_occurred` ON `analysis_events` (`customer_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `credit_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`batch_id` text,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`started_at` text NOT NULL,
	`started_by` text NOT NULL,
	`submitted_at` text,
	`submitted_by` text,
	`approved_at` text,
	`approved_by` text,
	`notes` text DEFAULT '' NOT NULL,
	`outcome` text,
	`proposed_limit` integer,
	`proposed_term_days` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_credit_analyses_customer_started` ON `credit_analyses` (`customer_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `customers` ADD `portfolio_curve` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `credit_term_days` integer DEFAULT 0 NOT NULL;