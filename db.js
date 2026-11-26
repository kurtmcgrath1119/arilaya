const path = require('path');
const Database = require('better-sqlite3');
const DB_FILE = path.resolve(process.env.DB_PATH || path.join(__dirname, 'arilaya.db'));
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
const userColumns = new Set(db.pragma('table_info(users)').map(column => column.name));
if (!userColumns.has('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
['first_name', 'last_name', 'phone', 'street', 'barangay', 'city', 'province'].forEach(column => {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT DEFAULT ''`);
});

const lotColumns = new Set(db.pragma('table_info(lots)').map(column => column.name));
if (!lotColumns.has('owner_id')) db.exec('ALTER TABLE lots ADD COLUMN owner_id INTEGER');
if (!lotColumns.has('approval')) db.exec("ALTER TABLE lots ADD COLUMN approval TEXT DEFAULT 'approved'");


db.exec(`
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  lot_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, lot_id)
);
CREATE TABLE IF NOT EXISTS lot_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS lot_photos_lot_order ON lot_photos(lot_id, sort_order, id);
`);

module.exports = db;