-- The file behind a medical summary, in object storage (Cloudflare R2).
--
-- All four nullable: a summary is not always a file. The seeded rows are a
-- clinician's written summary with nothing attached, and a doctor's signature is
-- what makes one a record — not whether a PDF came with it.
ALTER TABLE "medical_summaries" ADD COLUMN "fileKey"  TEXT,
                                ADD COLUMN "fileName" TEXT,
                                ADD COLUMN "fileMime" TEXT,
                                ADD COLUMN "fileSize" INTEGER;
