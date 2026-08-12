-- Somewhere the group does not want offered again, ever.
--
-- Visits already expire after a cooldown (see revisit.ts); this is the other reason to exclude a place,
-- and the only one that should be permanent. Defaults false, so every existing visit becomes an ordinary
-- cooldown rather than a silent ban.
ALTER TABLE `visited_places` ADD `never_again` integer DEFAULT false NOT NULL;
