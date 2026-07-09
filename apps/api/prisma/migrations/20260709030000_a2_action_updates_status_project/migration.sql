-- A2 delta (freeze §8/§10/§12): enum action_status mới + action_updates + actions.project_id.
-- actions rỗng (0 rows) nên đổi enum an toàn. action_updates tạo MỚI với enum đã đổi
-- → KHÔNG tham chiếu action_updates trong khối AlterEnum (khác SQL auto-gen bị sai thứ tự).

-- CreateEnum
CREATE TYPE "action_update_type" AS ENUM ('progress', 'issue', 'risk', 'recommendation', 'decision', 'result', 'note');

-- AlterEnum: action_status → tập giá trị chốt
BEGIN;
CREATE TYPE "action_status_new" AS ENUM ('draft', 'in_progress', 'on_hold', 'at_risk', 'done', 'cancelled');
ALTER TABLE "actions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "actions" ALTER COLUMN "status" TYPE "action_status_new" USING ("status"::text::"action_status_new");
ALTER TYPE "action_status" RENAME TO "action_status_old";
ALTER TYPE "action_status_new" RENAME TO "action_status";
DROP TYPE "action_status_old";
ALTER TABLE "actions" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- AlterTable: actions + project_id
ALTER TABLE "actions" ADD COLUMN "project_id" TEXT;

-- CreateTable: action_updates (append-only; dùng enum action_status mới)
CREATE TABLE "action_updates" (
    "id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "type" "action_update_type" NOT NULL DEFAULT 'progress',
    "content" TEXT NOT NULL,
    "progress_value" SMALLINT,
    "status_from" "action_status",
    "status_to" "action_status",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_updates_action_id_created_at_idx" ON "action_updates"("action_id", "created_at");
CREATE INDEX "actions_project_id_idx" ON "actions"("project_id");

-- AddForeignKey
ALTER TABLE "action_updates" ADD CONSTRAINT "action_updates_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "action_updates" ADD CONSTRAINT "action_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
