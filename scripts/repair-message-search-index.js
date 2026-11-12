/*
 * Rebuilds the derived SQLite FTS index used to search messages.
 * It does not alter message, session, contact, or media rows.
 */
const Database = require('better-sqlite3');
const path = require('path');

const databasePath = path.resolve(process.argv[2] || 'data/openwa.sqlite');
const database = new Database(databasePath, { timeout: 30_000 });

try {
  database.pragma('busy_timeout = 30000');
  database.exec("INSERT INTO messages_fts(messages_fts) VALUES ('rebuild')");
  console.log(`Rebuilt the message search index in ${databasePath}.`);
} finally {
  database.close();
}
