-- CreateTable
CREATE TABLE "external_entity_mappings" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "internal_id" TEXT NOT NULL,
    "import_batch_id" TEXT,
    "source_url" TEXT,
    "source_created_at" TIMESTAMP(3),
    "payload_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_import_batches" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'asana',
    "status" TEXT NOT NULL DEFAULT 'parsed',
    "source_project_id" TEXT,
    "source_project_name" TEXT,
    "target_project_id" TEXT,
    "default_org_unit_id" TEXT,
    "imported_by_id" TEXT NOT NULL,
    "mapping_json" JSONB,
    "normalized_json" JSONB,
    "payload_hash" TEXT,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_entity_mappings_import_batch_id_idx" ON "external_entity_mappings"("import_batch_id");

-- CreateIndex
CREATE INDEX "external_entity_mappings_internal_id_idx" ON "external_entity_mappings"("internal_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_entity_mappings_source_entity_type_external_id_key" ON "external_entity_mappings"("source", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "external_import_batches_imported_by_id_created_at_idx" ON "external_import_batches"("imported_by_id", "created_at");

-- CreateIndex
CREATE INDEX "external_import_batches_status_idx" ON "external_import_batches"("status");

-- AddForeignKey
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "external_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_import_batches" ADD CONSTRAINT "external_import_batches_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
