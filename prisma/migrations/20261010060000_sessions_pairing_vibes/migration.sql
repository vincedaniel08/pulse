-- Both tables only hold live sessions, so clear them rather than backfill
-- the new required column.
DELETE FROM "Signal";
DELETE FROM "Presence";

-- AlterTable
ALTER TABLE "Presence" DROP COLUMN "busy",
ADD COLUMN     "peerId" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "requestedId" TEXT,
ADD COLUMN     "tokenHash" TEXT NOT NULL,
ADD COLUMN     "vibe" TEXT,
ADD COLUMN     "wavedAt" TIMESTAMP(3);

