-- Gộp "Loại việc" (enum) vào "Section": bỏ hẳn cột enum sau khi đã backfill sang section_id.
-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "section";

-- DropEnum
DROP TYPE "task_section";
