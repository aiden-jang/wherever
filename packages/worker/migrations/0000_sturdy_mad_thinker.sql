CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`vote_mode` text DEFAULT 'majority' NOT NULL,
	`filters` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_code_unique` ON `sessions` (`code`);--> statement-breakpoint
CREATE TABLE `visited_places` (
	`id` text PRIMARY KEY NOT NULL,
	`session_code` text NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`visited_at` integer DEFAULT (unixepoch()) NOT NULL
);
