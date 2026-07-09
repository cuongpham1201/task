-- CreateEnum
CREATE TYPE "action_status" AS ENUM ('todo', 'doing', 'done', 'paused');

-- CreateEnum
CREATE TYPE "progress_mode" AS ENUM ('manual', 'auto_from_tasks');

-- AlterTable
ALTER TABLE "task_kpi_results" ADD COLUMN     "evidence_note" TEXT,
ADD COLUMN     "external_hrm_id" TEXT,
ADD COLUMN     "kpi_definition_id" TEXT,
ADD COLUMN     "kpi_weight" DOUBLE PRECISION,
ADD COLUMN     "on_time" BOOLEAN,
ADD COLUMN     "org_unit_id" TEXT,
ADD COLUMN     "review_result" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "action_id" TEXT,
ADD COLUMN     "is_scorable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kpi_definition_id" TEXT,
ADD COLUMN     "kpi_weight" DOUBLE PRECISION,
ADD COLUMN     "org_unit_id" TEXT,
ADD COLUMN     "project_id" TEXT,
ADD COLUMN     "review_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "org_unit_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "deadline" DATE,
    "status" "action_status" NOT NULL DEFAULT 'todo',
    "priority" "task_priority" NOT NULL DEFAULT 'normal',
    "progress_mode" "progress_mode" NOT NULL DEFAULT 'manual',
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "period" TEXT,
    "created_by" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "external_hrm_id" TEXT,
    "org_unit_id" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "default_weight" DOUBLE PRECISION,
    "period_type" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'HRM',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_org_unit_id_period_idx" ON "actions"("org_unit_id", "period");

-- CreateIndex
CREATE INDEX "actions_status_idx" ON "actions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_external_hrm_id_key" ON "kpi_definitions"("external_hrm_id");

-- CreateIndex
CREATE INDEX "kpi_definitions_org_unit_id_idx" ON "kpi_definitions"("org_unit_id");

-- CreateIndex
CREATE INDEX "task_kpi_results_task_id_idx" ON "task_kpi_results"("task_id");

-- CreateIndex
CREATE INDEX "tasks_org_unit_id_status_idx" ON "tasks"("org_unit_id", "status");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_action_id_idx" ON "tasks"("action_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "kpi_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_kpi_results" ADD CONSTRAINT "task_kpi_results_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_kpi_results" ADD CONSTRAINT "task_kpi_results_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- A1 BACKFILL dữ liệu hiện có (theo quyết định đã duyệt Q1/Q3)
-- ═══════════════════════════════════════════════════════════════

-- project_id: task đang thuộc workspace type=project (P1: project_id = workspace.id)
UPDATE "tasks" t
SET "project_id" = t."workspace_id"
FROM "workspaces" w
WHERE t."workspace_id" = w."id" AND w."type" = 'project';

-- org_unit_id (1): task thuộc workspace org_unit → lấy org_unit của workspace
UPDATE "tasks" t
SET "org_unit_id" = w."org_unit_id"
FROM "workspaces" w
WHERE t."workspace_id" = w."id" AND w."type" = 'org_unit' AND w."org_unit_id" IS NOT NULL;

-- org_unit_id (2): task project/cá nhân → ưu tiên org của assignee, thiếu thì creator (Q3)
UPDATE "tasks" t
SET "org_unit_id" = COALESCE(a."org_unit_id", c."org_unit_id")
FROM "users" a, "users" c
WHERE t."org_unit_id" IS NULL AND a."id" = t."assignee_id" AND c."id" = t."creator_id";

-- review_required: suy từ completion_mode cũ (canonical mới)
UPDATE "tasks" SET "review_required" = true WHERE "completion_mode" = 'review_required';

-- accepted_at: task đã nghiệm thu Đạt trước đó
UPDATE "tasks" t
SET "accepted_at" = tr."reviewed_at"
FROM "task_reviews" tr
WHERE tr."task_id" = t."id" AND tr."decision" = 'passed';
