#!/usr/bin/env node
'use strict';

/**
 * One-shot backfill: extract text for all attachments that don't have it yet.
 *
 * Usage:
 *   node server/scripts/backfill-extracted-text.js
 *
 * Environment:
 *   DB_PATH — defaults to data/job-tracker.db
 */

const path = require('path');
const db = require('../db');
const { extractText } = require('../services/extraction');

const uploadsDir = path.resolve(path.join(__dirname, '..', '..', 'uploads'));

async function main() {
  const rows = db.prepare(
    "SELECT id, stored_filename, mime_type FROM attachments WHERE extracted_text IS NULL"
  ).all();

  console.log(`Found ${rows.length} attachments without extracted text.`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const filePath = path.join(uploadsDir, row.stored_filename);
    if (!require('fs').existsSync(filePath)) {
      console.log(`  [skip] File not found: ${row.stored_filename}`);
      skipped++;
      continue;
    }

    const text = await extractText(filePath, row.mime_type);
    if (text) {
      db.prepare(
        'UPDATE attachments SET extracted_text = ?, extracted_at = ? WHERE id = ?'
      ).run(text, new Date().toISOString(), row.id);
      console.log(`  [ok]   ${row.stored_filename} (${text.length} chars)`);
      success++;
    } else {
      console.log(`  [none] ${row.stored_filename} (no text extracted)`);
      failed++;
    }
  }

  console.log(`\nDone. Success: ${success}, No text: ${failed}, Skipped: ${skipped}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
