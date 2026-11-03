import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds media.sourceMediaId (WordPress attachment id written by the WP importer so re-imports
// are idempotent). Idempotent + reversible: safe on databases that already have the column.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "source_media_id" varchar;
  CREATE INDEX IF NOT EXISTS "media_source_media_id_idx" ON "media" USING btree ("source_media_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "media_source_media_id_idx";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "source_media_id";`)
}
