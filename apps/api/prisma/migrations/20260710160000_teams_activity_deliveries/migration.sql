-- Teams Activity Feed delivery log (additive — không đụng dữ liệu hiện có)
CREATE TABLE "teams_activity_deliveries" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "recipient_entra_id" TEXT,
    "activity_type" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teams_activity_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teams_activity_deliveries_event_key_key" ON "teams_activity_deliveries"("event_key");
CREATE INDEX "teams_activity_deliveries_recipient_user_id_created_at_idx" ON "teams_activity_deliveries"("recipient_user_id", "created_at");
