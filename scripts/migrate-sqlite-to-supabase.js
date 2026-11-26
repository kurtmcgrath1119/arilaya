require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const db = require('../db');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.resolve(process.env.DB_PATH || path.join(ROOT, 'arilaya.db'));
const SOURCE_UPLOADS = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(path.dirname(SOURCE_PATH), 'uploads');
const BUCKET = 'lot-photos';

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const postgresTimestamp = value => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const text = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T') + 'Z';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const phone = value => {
  let number = String(value || '').replace(/[\s-]/g, '');
  if (number.startsWith('+63')) number = '0' + number.slice(3);
  return number;
};

async function assertEmptyDestination() {
  const authUsers = await db.one('SELECT COUNT(*)::int AS count FROM auth.users');
  const objects = await db.one("SELECT COUNT(*)::int AS count FROM storage.objects WHERE bucket_id = $1", [BUCKET]);
  const counts = {};
  for (const table of ['profiles', 'lots', 'landmarks', 'feedback', 'favorites', 'lot_photos', 'migration_user_map']) {
    counts[table] = (await db.one(`SELECT COUNT(*)::int AS count FROM ${table}`)).count;
  }
  if (authUsers.count || objects.count || Object.values(counts).some(Boolean)) {
    throw new Error('The destination is not empty. Use a fresh Supabase project; this importer will not merge or overwrite existing data.');
  }
}

async function readSource(sourcePath) {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const tables = ['users', 'lots', 'landmarks', 'feedback', 'favorites', 'lot_photos'];
    for (const table of tables) source.prepare(`SELECT * FROM ${table}`).all();
    const users = source.prepare('SELECT * FROM users ORDER BY id').all();
    const lots = source.prepare('SELECT * FROM lots ORDER BY id').all();
    const landmarks = source.prepare('SELECT * FROM landmarks ORDER BY id').all();
    const feedback = source.prepare('SELECT * FROM feedback ORDER BY id').all();
    const favorites = source.prepare('SELECT * FROM favorites ORDER BY user_id, lot_id').all();
    const photos = source.prepare('SELECT * FROM lot_photos ORDER BY id').all();

    const emails = new Set();
    for (const user of users) {
      const email = String(user.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error(`Source user #${user.id} has an invalid email.`);
      if (emails.has(email)) throw new Error(`Source contains a duplicate email for user #${user.id}.`);
      emails.add(email);
      if (!['buyer', 'seller'].includes(user.role)) throw new Error(`Source user #${user.id} has an unsupported role.`);
    }

    const userIds = new Set(users.map(user => user.id));
    const lotIds = new Set(lots.map(lot => lot.id));
    for (const lot of lots) {
      if (lot.owner_id != null && !userIds.has(lot.owner_id)) throw new Error(`Lot #${lot.id} has a missing owner.`);
      const boundary = typeof lot.boundary === 'string' ? JSON.parse(lot.boundary) : lot.boundary;
      if (!Array.isArray(boundary) || boundary.length < 3) throw new Error(`Lot #${lot.id} has an invalid boundary.`);
      if (!Number.isFinite(Number(lot.price)) || !(Number(lot.area_sqm) > 0)) throw new Error(`Lot #${lot.id} has invalid price or area.`);
      if (!Number.isFinite(Number(lot.center_lat)) || !Number.isFinite(Number(lot.center_lng))) throw new Error(`Lot #${lot.id} has an invalid center.`);
    }
    for (const favorite of favorites) {
      if (!userIds.has(favorite.user_id) || !lotIds.has(favorite.lot_id)) throw new Error('Source contains an orphaned favorite.');
    }
    for (const photo of photos) {
      if (!lotIds.has(photo.lot_id)) throw new Error(`Photo #${photo.id} has a missing lot.`);
      if (path.basename(photo.filename) !== photo.filename) throw new Error(`Photo #${photo.id} has an unsafe filename.`);
    }
    return { users, lots, landmarks, feedback, favorites, photos };
  } finally {
    source.close();
  }
}

async function createAuthUsers(users) {
  const mapping = new Map();
  const created = [];
  try {
    for (const user of users) {
      const email = String(user.email).trim().toLowerCase();
      const isLocal = String(user.google_sub || '').startsWith('local:');
      const metadata = {
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        full_name: user.name || '',
        name: user.name || '',
        picture: user.picture || '',
        avatar_url: user.picture || '',
        phone: phone(user.phone),
        street: user.street || '',
        barangay: user.barangay || '',
        city: user.city || '',
        province: user.province || ''
      };
      if (!isLocal) metadata.sub = user.google_sub;
      const { data, error } = await db.supabase.auth.admin.createUser({
        email,
        password: crypto.randomBytes(32).toString('hex'),
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: isLocal
          ? { provider: 'email', providers: ['email'] }
          : { provider: 'google', providers: ['google'] }
      });
      if (error || !data.user) throw new Error(`Could not create Auth user #${user.id}: ${error?.message || 'unknown error'}`);
      mapping.set(user.id, data.user.id);
      created.push(data.user.id);
    }
    return { mapping, created };
  } catch (error) {
    for (const id of created.reverse()) {
      const { error: cleanupError } = await db.supabase.auth.admin.deleteUser(id);
      if (cleanupError) console.error(`Cleanup could not remove Auth user ${id}: ${cleanupError.message}`);
    }
    throw error;
  }
}

async function uploadPhotos(photos, uploadDir) {
  const plans = [];
  const uploaded = [];
  try {
    for (const photo of photos) {
      const input = path.join(uploadDir, photo.filename);
      if (!fs.existsSync(input)) throw new Error(`Missing photo file for photo #${photo.id}: ${photo.filename}`);
      const { data } = await sharp(input).rotate()
        .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const digest = crypto.createHash('sha256').update(data).digest('hex').slice(0, 20);
      const storagePath = `lots/legacy-${photo.id}-${digest}.webp`;
      const { error } = await db.supabase.storage.from(BUCKET).upload(storagePath, data, {
        contentType: 'image/webp',
        upsert: true
      });
      if (error) throw new Error(`Could not upload photo #${photo.id}: ${error.message}`);
      uploaded.push(storagePath);
      plans.push({ ...photo, storagePath });
    }
    return { plans, uploaded };
  } catch (error) {
    if (uploaded.length) {
      const { error: cleanupError } = await db.supabase.storage.from(BUCKET).remove(uploaded);
      if (cleanupError) console.error(`Photo cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
}

async function importRows(source, mapping, photoPlans) {
  return db.transaction(async client => {
    for (const user of source.users) {
      const authUserId = mapping.get(user.id);
      const isLocal = String(user.google_sub || '').startsWith('local:');
      await client.query(`INSERT INTO profiles
        (id, email, name, picture, role, phone, street, barangay, city, province, google_sub, legacy_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture,
          role = EXCLUDED.role, phone = EXCLUDED.phone, street = EXCLUDED.street, barangay = EXCLUDED.barangay,
          city = EXCLUDED.city, province = EXCLUDED.province, google_sub = EXCLUDED.google_sub,
          legacy_id = EXCLUDED.legacy_id, created_at = EXCLUDED.created_at`, [
        authUserId, String(user.email).trim().toLowerCase(), user.name || '', user.picture || '', user.role,
        phone(user.phone), user.street || '', user.barangay || '', user.city || '', user.province || '',
        isLocal ? null : user.google_sub, user.id, postgresTimestamp(user.created_at)
      ]);
      await client.query('INSERT INTO migration_user_map (legacy_id, auth_user_id) VALUES ($1, $2)', [user.id, authUserId]);
    }

    for (const lot of source.lots) {
      const boundary = typeof lot.boundary === 'string' ? JSON.parse(lot.boundary) : lot.boundary;
      await client.query(`INSERT INTO lots
        (id, title, barangay, address, nearest_road, landmark, price, area_sqm, land_type, status,
         seller_name, seller_phone, description, boundary, center_lat, center_lng, owner_id, approval, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, [
        lot.id, lot.title, lot.barangay, lot.address || '', lot.nearest_road || '', lot.landmark || '',
        Number(lot.price), Number(lot.area_sqm), lot.land_type || 'residential', lot.status || 'available',
        lot.seller_name || '', lot.seller_phone || '', lot.description || '', JSON.stringify(boundary),
        Number(lot.center_lat), Number(lot.center_lng), lot.owner_id == null ? null : mapping.get(lot.owner_id),
        lot.approval || 'approved', postgresTimestamp(lot.updated_at)
      ]);
    }

    for (const landmark of source.landmarks) {
      await client.query('INSERT INTO landmarks (id, name, category, lat, lng) VALUES ($1,$2,$3,$4,$5)',
        [landmark.id, landmark.name, landmark.category || '', Number(landmark.lat), Number(landmark.lng)]);
    }
    for (const item of source.feedback) {
      await client.query(`INSERT INTO feedback
        (id, role, functionality, usability, reliability, satisfaction, comment, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
        item.id, item.role, item.functionality, item.usability, item.reliability, item.satisfaction,
        item.comment || '', postgresTimestamp(item.created_at)
      ]);
    }
    for (const favorite of source.favorites) {
      await client.query('INSERT INTO favorites (user_id, lot_id, created_at) VALUES ($1,$2,$3)',
        [mapping.get(favorite.user_id), favorite.lot_id, postgresTimestamp(favorite.created_at)]);
    }
    for (const photo of photoPlans) {
      await client.query('INSERT INTO lot_photos (id, lot_id, filename, sort_order, created_at) VALUES ($1,$2,$3,$4,$5)',
        [photo.id, photo.lot_id, photo.storagePath, photo.sort_order || 0, postgresTimestamp(photo.created_at)]);
    }

    for (const table of ['lots', 'landmarks', 'feedback', 'lot_photos']) {
      await client.query(`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'),
        COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`);
    }

    const expected = {
      profiles: source.users.length,
      migration_user_map: source.users.length,
      lots: source.lots.length,
      landmarks: source.landmarks.length,
      feedback: source.feedback.length,
      favorites: source.favorites.length,
      lot_photos: source.photos.length
    };
    for (const [table, count] of Object.entries(expected)) {
      const actual = (await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count;
      if (actual !== count) throw new Error(`Validation failed for ${table}: expected ${count}, found ${actual}.`);
    }
    const orphaned = (await client.query(`SELECT
      (SELECT COUNT(*)::int FROM lots l LEFT JOIN profiles p ON p.id = l.owner_id WHERE l.owner_id IS NOT NULL AND p.id IS NULL) +
      (SELECT COUNT(*)::int FROM favorites f LEFT JOIN profiles p ON p.id = f.user_id WHERE p.id IS NULL) +
      (SELECT COUNT(*)::int FROM lot_photos ph LEFT JOIN lots l ON l.id = ph.lot_id WHERE l.id IS NULL) AS count`)).rows[0].count;
    if (orphaned) throw new Error('Relationship validation failed after import.');
  });
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`SQLite database not found: ${SOURCE_PATH}`);
  const backupDir = path.join(ROOT, 'backups', `migration-${timestamp()}`);
  const backupPath = path.join(backupDir, 'arilaya.db');
  const backupUploads = path.join(backupDir, 'uploads');
  fs.mkdirSync(backupUploads, { recursive: true });

  console.log('Creating a fresh WAL-aware SQLite backup…');
  const sourceDb = new Database(SOURCE_PATH, { readonly: true, fileMustExist: true });
  try {
    await sourceDb.backup(backupPath);
  } finally {
    sourceDb.close();
  }
  if (fs.existsSync(SOURCE_UPLOADS)) fs.cpSync(SOURCE_UPLOADS, backupUploads, { recursive: true });

  const source = await readSource(backupPath);
  await assertEmptyDestination();
  console.log(`Importing ${source.users.length} users, ${source.lots.length} lots, and ${source.photos.length} photos…`);
  const { mapping, created } = await createAuthUsers(source.users);
  let uploaded = [];
  let committed = false;
  try {
    const photoResult = await uploadPhotos(source.photos, backupUploads);
    uploaded = photoResult.uploaded;
    await importRows(source, mapping, photoResult.plans);
    committed = true;
  } catch (error) {
    if (!committed) {
      if (uploaded.length) await db.supabase.storage.from(BUCKET).remove(uploaded);
      for (const id of created.reverse()) {
        const { error: cleanupError } = await db.supabase.auth.admin.deleteUser(id);
        if (cleanupError) console.error(`Cleanup could not remove Auth user ${id}: ${cleanupError.message}`);
      }
    }
    throw error;
  }

  console.log('Migration complete.');
  console.log(`Backup: ${path.relative(ROOT, backupDir)}`);
  console.log(JSON.stringify({
    users: source.users.length,
    lots: source.lots.length,
    landmarks: source.landmarks.length,
    feedback: source.feedback.length,
    favorites: source.favorites.length,
    photos: source.photos.length
  }, null, 2));
  console.log('Migrated users must use “Forgot password?” once to set a Supabase password.');
  if (source.users.some(user => !String(user.google_sub || '').startsWith('local:'))) {
    console.log('Google identities were preserved by email/subject metadata; verify same-email Google linking in staging.');
  }
}

main().catch(error => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await db.pool.end();
});
