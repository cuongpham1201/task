-- AlterTable
ALTER TABLE "org_unit_roles" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "note" VARCHAR(300),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "org_unit_roles_user_id_active_idx" ON "org_unit_roles"("user_id", "active");

-- CreateIndex
CREATE INDEX "org_unit_roles_org_unit_id_active_idx" ON "org_unit_roles"("org_unit_id", "active");

-- CreateIndex
CREATE INDEX "org_unit_roles_source_idx" ON "org_unit_roles"("source");

-- AddForeignKey
ALTER TABLE "org_unit_roles" ADD CONSTRAINT "org_unit_roles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
