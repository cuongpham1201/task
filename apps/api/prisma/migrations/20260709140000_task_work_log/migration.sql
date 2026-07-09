-- Item 12: task_work_logs (nhật ký thực hiện, append-only)
CREATE TABLE "task_work_logs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "progress_value" SMALLINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_work_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_work_logs_task_id_created_at_idx" ON "task_work_logs"("task_id", "created_at");
ALTER TABLE "task_work_logs" ADD CONSTRAINT "task_work_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_work_logs" ADD CONSTRAINT "task_work_logs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
