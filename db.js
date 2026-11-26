const Database = require('better-sqlite3');
const db = new Database(process.env.DB_PATH || 'arilaya.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  barangay TEXT NOT NULL,
  address TEXT DEFAULT '',
  nearest_road TEXT DEFAULT '',
  landmark TEXT DEFAULT '',
  price REAL NOT NULL,
  area_sqm REAL NOT NULL,
  land_type TEXT NOT NULL DEFAULT 'residential',
  status TEXT NOT NULL DEFAULT 'available',
  seller_name TEXT DEFAULT '',
  seller_phone TEXT DEFAULT '',
  description TEXT DEFAULT '',
  boundary TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS landmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  functionality INTEGER, usability INTEGER, reliability INTEGER, satisfaction INTEGER,
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('buyer','seller')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT'); } catch (e) {}
// extra profile details for registration (safe to run more than once)
['first_name', 'last_name', 'phone', 'street', 'barangay', 'city', 'province'].forEach(c => {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT DEFAULT ''`); } catch (e) {}
});

try { db.exec('ALTER TABLE lots ADD COLUMN owner_id INTEGER'); } catch (e) {}
try { db.exec("ALTER TABLE lots ADD COLUMN approval TEXT DEFAULT 'approved'"); } catch (e) {}


db.exec(`
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  lot_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, lot_id)
);
`);

module.exports = db;