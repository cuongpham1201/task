-- Attachments: nới drive* nullable (SharePoint để sau) + thêm storage_key (local dev).
ALTER TABLE "attachments" ALTER COLUMN "drive_id" DROP NOT NULL;
ALTER TABLE "attachments" ALTER COLUMN "drive_item_id" DROP NOT NULL;
ALTER TABLE "attachments" ALTER COLUMN "web_url" DROP NOT NULL;
ALTER TABLE "attachments" ADD COLUMN "storage_key" TEXT;
