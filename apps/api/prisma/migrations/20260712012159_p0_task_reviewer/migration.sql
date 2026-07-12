-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "reviewer_id" TEXT;

-- CreateIndex
CREATE INDEX "tasks_reviewer_id_idx" ON "tasks"("reviewer_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- P0-2 backfill: task cũ có review_required nhưng chưa có reviewer chỉ định
-- → reviewer = người tạo (đúng người duyệt mặc định của rule cũ). Không đụng task khác.
UPDATE "tasks" SET "reviewer_id" = "creator_id"
WHERE "review_required" = true AND "reviewer_id" IS NULL;
