require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const sourcePath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'arilaya.db'));
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(path.dirname(sourcePath), 'uploads');

if (!fs.existsSync(sourcePath)) {
  console.error(`Database not found: ${sourcePath}`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(__dirname, 'backups', timestamp);
const outputPath = path.join(outputDir, 'arilaya.db');
fs.mkdirSync(path.join(outputDir, 'uploads'), { recursive: true });

async function main() {
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(outputPath);
    const counts = {
      users: db.prepare('SELECT COUNT(*) count FROM users').get().count,
      lots: db.prepare('SELECT COUNT(*) count FROM lots').get().count,
      photos: db.prepare('SELECT COUNT(*) count FROM lot_photos').get().count
    };
    if (fs.existsSync(uploadDir)) {
      fs.cpSync(uploadDir, path.join(outputDir, 'uploads'), { recursive: true });
    }
    console.log(`Backup created: ${path.relative(__dirname, outputDir)}`);
    console.log(JSON.stringify(counts));
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
});
