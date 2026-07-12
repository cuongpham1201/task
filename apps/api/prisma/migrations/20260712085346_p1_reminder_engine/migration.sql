-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'task_not_started';
ALTER TYPE "notification_type" ADD VALUE 'review_waiting';
ALTER TYPE "notification_type" ADD VALUE 'returned_pending';
ALTER TYPE "notification_type" ADD VALUE 'action_due_soon';
ALTER TYPE "notification_type" ADD VALUE 'action_overdue';
ALTER TYPE "notification_type" ADD VALUE 'action_empty';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "action_id" TEXT,
ADD COLUMN     "payload" JSONB;

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "stage_key" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'inapp',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_runs" (
    "id" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "duplicate" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "reminder_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_dedupe_key_key" ON "reminder_deliveries"("dedupe_key");

-- CreateIndex
CREATE INDEX "reminder_deliveries_entity_type_entity_id_idx" ON "reminder_deliveries"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "reminder_deliveries_recipient_id_created_at_idx" ON "reminder_deliveries"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "reminder_runs_started_at_idx" ON "reminder_runs"("started_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
