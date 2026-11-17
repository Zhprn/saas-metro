/**
 * One-off migration: copy every file referenced by a Cloudinary URL in the
 * database into Supabase Storage, then rewrite the URL in the database.
 *
 * Files are downloaded through their public Cloudinary URL, so no Cloudinary
 * credentials are needed.
 *
 * Usage (from project root):
 *   node -r dotenv/config scripts/migrate-cloudinary-to-supabase.js          # dry run, changes nothing
 *   node -r dotenv/config scripts/migrate-cloudinary-to-supabase.js --apply  # really migrate
 *
 * Needs env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *            SUPABASE_STORAGE_BUCKET (optional, default "uploads")
 *
 * Safe to re-run: rows already pointing to Supabase are skipped.
 */
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

// table / column / target folder in the bucket
const TARGETS = [
  { table: 'aiknowledgefile', column: 'fileUrl', folder: 'ai-knowledge' },
  { table: 'whatsappmessage', column: 'mediaUrl', folder: 'whatsapp-image' },
];

const prisma = new PrismaClient();

function safeName(url) {
  let name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file');
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = name
    .slice(0, name.length - path.extname(name).length)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base || 'file'}${ext}`;
}

async function main() {
  if (APPLY && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env');
  }
  const supabase = APPLY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

  if (APPLY) {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (!data) {
      const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
      if (error) throw error;
      console.log(`Bucket "${BUCKET}" dibuat (public).`);
    }
  }

  console.log(APPLY ? '=== MODE APPLY ===' : '=== DRY RUN (tidak ada yang diubah, pakai --apply) ===');

  const migrated = new Map(); // old url -> new url (same file used by several rows)
  const failed = [];
  let updatedRows = 0;

  for (const t of TARGETS) {
    const rows = await prisma.$queryRawUnsafe(
      `select id, "${t.column}" as url from "public"."${t.table}" where "${t.column}" like '%res.cloudinary.com%'`,
    );
    console.log(`\n${t.table}.${t.column}: ${rows.length} baris`);

    for (const row of rows) {
      const oldUrl = row.url;
      if (!APPLY) {
        console.log(`  - ${oldUrl}`);
        continue;
      }
      try {
        let newUrl = migrated.get(oldUrl);
        if (!newUrl) {
          const res = await fetch(oldUrl);
          if (!res.ok) throw new Error(`download HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          let contentType = res.headers.get('content-type') || 'application/octet-stream';
          if (t.folder === 'ai-knowledge') contentType = 'application/pdf';

          const objectPath = `${t.folder}/${safeName(oldUrl)}`;
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(objectPath, buffer, { contentType, upsert: false });
          if (error) throw new Error(`upload: ${error.message}`);

          newUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
          migrated.set(oldUrl, newUrl);
        }

        await prisma.$executeRawUnsafe(
          `update "public"."${t.table}" set "${t.column}" = $1 where id = $2`,
          newUrl,
          row.id,
        );
        updatedRows++;
        console.log(`  OK  ${row.id} -> ${newUrl}`);
      } catch (err) {
        failed.push({ table: t.table, id: row.id, url: oldUrl, error: err.message });
        console.log(`  GAGAL ${row.id}: ${err.message}`);
      }
    }
  }

  console.log(`\nSelesai. File dipindah: ${migrated.size}, baris diupdate: ${updatedRows}, gagal: ${failed.length}`);
  if (failed.length) {
    console.log('Baris yang gagal (URL lama tetap dipakai, bisa dijalankan ulang):');
    console.table(failed);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
