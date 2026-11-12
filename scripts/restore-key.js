/*
 * Re-activates a revoked API key and saves it to data/.api-key.
 *
 * Usage:
 *   node scripts/restore-key.js              (uses the key already saved in data/.api-key)
 *   node scripts/restore-key.js <raw-key>    (e.g. owa_k1_...)
 *
 * The key row is found by its 12-character prefix, the same lookup the server uses.
 * No key is stored in this file: keys must never be committed to Git.
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const keyFile = path.resolve('data/.api-key');
const rawKey = (process.argv[2] || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf-8') : '')).trim();

if (!rawKey.startsWith('owa_k1_')) {
  console.error('No API key given. Run: node scripts/restore-key.js <owa_k1_...>');
  process.exit(1);
}

const db = new Database('data/main.sqlite');
try {
  const keyPrefix = rawKey.substring(0, 12);
  const row = db.prepare('SELECT id FROM api_keys WHERE keyPrefix = ?').get(keyPrefix);
  if (!row) {
    console.error(`No API key with prefix ${keyPrefix} exists in data/main.sqlite.`);
    process.exit(1);
  }

  const res = db.prepare('UPDATE api_keys SET isActive = 1 WHERE id = ?').run(row.id);
  console.log('Restored isActive=1 for API key, affected rows:', res.changes);

  fs.writeFileSync(keyFile, rawKey, 'utf-8');
  console.log('Saved raw API key to data/.api-key successfully!');

  const check = db.prepare('SELECT id, name, keyPrefix, role, isActive FROM api_keys WHERE id = ?').get(row.id);
  console.log('Verified Database Row:', check);
} finally {
  db.close();
}
