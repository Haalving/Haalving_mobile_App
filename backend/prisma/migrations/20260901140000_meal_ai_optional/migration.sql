-- The AI pre-score becomes optional.
--
-- A meal captured from the client app arrives BEFORE anything has scored it, and
-- there is no scoring service. NOT NULL forced a value to be invented at capture,
-- and the only values available were zeros — a fabricated assessment, and the
-- worst possible one, shown to the dietitian who has to rate the plate.
--
-- NULL now means "no AI has looked at this", which is a state the product has.
-- Existing rows keep their values: every meal in the table today was seeded with a
-- real pre-score, so nothing is being erased here, only made optional going
-- forward.
ALTER TABLE "meals" ALTER COLUMN "aiStars" DROP NOT NULL;
ALTER TABLE "meals" ALTER COLUMN "aiConf"  DROP NOT NULL;
ALTER TABLE "meals" ALTER COLUMN "aiNote"  DROP NOT NULL;
