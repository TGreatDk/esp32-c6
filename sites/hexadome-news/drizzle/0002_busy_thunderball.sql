CREATE TABLE `initiative` (
	`id` integer PRIMARY KEY NOT NULL,
	`names` text NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
