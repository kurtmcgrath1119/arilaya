require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const db = require('./db');

const app = express();
const BUCKET = 'lot-photos';
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_PHOTOS = 6;
const DIST = path.join(__dirname, 'client', 'dist');

app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(DIST));
app.use(express.static(path.join(__dirname, 'public')));

const STATUS = ['available', 'reserved', 'sold'];
const TYPES = ['residential', 'agricultural', 'commercial', 'industrial'];
const FIELDS = ['title', 'barangay', 'address', 'nearest_road', 'landmark', 'price', 'area_sqm',
  'land_type', 'status', 'seller_name', 'seller_phone', 'description', 'boundary', 'center_lat', 'center_lng'];

function clean(b) {
  const t = x => String(x ?? '').trim();
  const o = {
    title: t(b.title), barangay: t(b.barangay), address: t(b.address),
    nearest_road: t(b.nearest_road), landmark: t(b.landmark),
    price: Number(b.price), area_sqm: Number(b.area_sqm),
    land_type: t(b.land_type), status: t(b.status),
    seller_name: t(b.seller_name), seller_phone: t(b.seller_phone), description: t(b.description),
    center_lat: Number(b.center_lat), center_lng: Number(b.center_lng)
  };
  if (!o.title || !o.barangay) return { error: 'Title and barangay are required.' };
  if (!(o.price >= 0) || !(o.area_sqm > 0)) return { error: 'Price and area must be valid numbers.' };
  if (!TYPES.includes(o.land_type) || !STATUS.includes(o.status)) return { error: 'Invalid land type or status.' };
  let boundary = b.boundary;
  if (typeof boundary === 'string') {
    try { boundary = JSON.parse(boundary); } catch { boundary = []; }
  }
  const points = Array.isArray(boundary) ? boundary : [];
  if (points.length < 3 || points.some(point => !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)))
    return { error: 'Mark at least 3 boundary points on the map.' };
  if (!Number.isFinite(o.center_lat) || !Number.isFinite(o.center_lng)) return { error: 'Invalid map location.' };
  o.boundary = JSON.stringify(points.map(point => ({ lat: Number(point.lat), lng: Number(point.lng) })));
  return { o };
}

async function optionalAuth(req, res, next) {
  const match = String(req.headers.authorization || '').match(/^Bearer (.+)$/i);
  if (!match) return next();
  try {
    const { data, error } = await db.supabase.auth.getUser(match[1]);
    if (error || !data.user) return next();
    req.profile = await db.one('SELECT * FROM profiles WHERE id = $1', [data.user.id]);
  } catch (error) {
    console.error('Token verification failed:', error.message);
  }
  next();
}

const requireAuth = (req, res, next) => req.profile
  ? next()
  : res.status(401).json({ error: 'Login required' });
const requireRole = role => (req, res, next) => {
  if (!req.profile) return res.status(401).json({ error: 'Login required' });
  if (req.profile.role !== role) return res.status(403).json({ error: `${role[0].toUpperCase() + role.slice(1)} account required` });
  next();
};
const admin = (req, res, next) => {
  if (!req.profile) return res.status(401).json({ error: 'Login required' });
  if (req.profile.role !== 'admin') return res.status(403).json({ error: 'Admin account required' });
  next();
};

const userView = profile => profile && ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  picture: profile.picture || '',
  role: profile.role
});

async function withPhotos(rows) {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const photos = await db.query(
    'SELECT id, lot_id, filename FROM lot_photos WHERE lot_id = ANY($1::int[]) ORDER BY sort_order, id',
    [ids]
  );
  const paths = photos.rows.map(photo => photo.filename);
  const signed = new Map();
  await Promise.all(paths.map(async filename => {
    const { data, error } = await db.supabase.storage.from(BUCKET).createSignedUrl(filename, SIGNED_URL_SECONDS);
    if (error) console.error(`Could not sign photo ${filename}:`, error.message);
    else if (data?.signedUrl) signed.set(filename, data.signedUrl);
  }));
  const byLot = new Map();
  for (const photo of photos.rows) {
    if (!signed.has(photo.filename)) continue;
    if (!byLot.has(photo.lot_id)) byLot.set(photo.lot_id, []);
    byLot.get(photo.lot_id).push({ id: photo.id, url: signed.get(photo.filename) });
  }
  return rows.map(row => ({ ...row, boundary: row.boundary, photos: byLot.get(row.id) || [] }));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_PHOTOS },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      return cb(new Error('Only JPG, PNG, and WebP photos are allowed.'));
    cb(null, true);
  }
});

function uploadPhotos(req, res, next) {
  upload.array('photos', MAX_PHOTOS)(req, res, error => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 8 MB or smaller.'
      : ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code) ? 'You can upload up to 6 photos.'
        : error.message || 'Photo upload failed.';
    res.status(400).json({ error: message });
  });
}

async function removeStorageObjects(paths) {
  if (!paths.length) return;
  const { error } = await db.supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error('Could not remove stored photos:', error.message);
}

async function processPhotoFiles(files = []) {
  const paths = [];
  try {
    for (const file of files) {
      const { data } = await sharp(file.buffer).rotate()
        .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const storagePath = `lots/${crypto.randomUUID()}.webp`;
      const { error } = await db.supabase.storage.from(BUCKET).upload(storagePath, data, {
        contentType: 'image/webp',
        upsert: false
      });
      if (error) throw error;
      paths.push(storagePath);
    }
    return paths;
  } catch (error) {
    await removeStorageObjects(paths);
    throw error;
  }
}

async function insertPhotoRows(client, lotId, paths, startOrder = 0) {
  for (const [index, storagePath] of paths.entries()) {
    await client.query(
      'INSERT INTO lot_photos (lot_id, filename, sort_order) VALUES ($1, $2, $3)',
      [lotId, storagePath, startOrder + index]
    );
  }
}

function parseRemovedPhotos(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map(Number).filter(Number.isInteger))];
}

async function deleteLot(id, ownerId = null) {
  const deleted = await db.transaction(async client => {
    const params = ownerId ? [id, ownerId] : [id];
    const where = ownerId ? 'WHERE id = $1 AND owner_id = $2' : 'WHERE id = $1';
    const photos = await client.query(`SELECT filename FROM lot_photos WHERE lot_id = $1`, [id]);
    const result = await client.query(`DELETE FROM lots ${where} RETURNING id`, params);
    return { deleted: result.rowCount > 0, paths: photos.rows.map(row => row.filename) };
  });
  if (deleted.deleted) await removeStorageObjects(deleted.paths);
  return deleted.deleted;
}

app.get('/api/lots', optionalAuth, async (req, res) => {
  const rows = req.profile?.role === 'admin'
    ? await db.query('SELECT * FROM lots ORDER BY id DESC')
    : await db.query("SELECT * FROM lots WHERE approval = 'approved' ORDER BY id DESC");
  res.json(await withPhotos(rows.rows));
});

app.get('/api/landmarks', async (req, res) => {
  const result = await db.query('SELECT * FROM landmarks ORDER BY name');
  res.json(result.rows);
});

app.get('/api/health', async (req, res) => {
  const result = await db.one("SELECT COUNT(*)::int AS count FROM lots WHERE approval = 'approved'");
  res.json({
    ok: true,
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    customStorageConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
    approvedLots: result.count
  });
});

app.post('/api/feedback', async (req, res) => {
  const b = req.body || {};
  const rating = key => {
    const value = Number(b[key]);
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  };
  const feedback = {
    functionality: rating('functionality'), usability: rating('usability'),
    reliability: rating('reliability'), satisfaction: rating('satisfaction')
  };
  if (Object.values(feedback).some(value => value === null))
    return res.status(400).json({ error: 'Rate all four items from 1 to 5.' });
  const role = ['buyer', 'seller', 'stakeholder'].includes(b.role) ? b.role : 'buyer';
  await db.query(
    'INSERT INTO feedback (role, functionality, usability, reliability, satisfaction, comment) VALUES ($1, $2, $3, $4, $5, $6)',
    [role, feedback.functionality, feedback.usability, feedback.reliability, feedback.satisfaction,
      String(b.comment || '').slice(0, 1000)]
  );
  res.json({ ok: true });
});

app.get('/api/auth/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID)
  });
});

app.get('/api/auth/me', optionalAuth, (req, res) => res.json({ user: userView(req.profile) }));

app.post('/api/lots', optionalAuth, admin, async (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const values = FIELDS.map(field => o[field]);
  const result = await db.query(
    `INSERT INTO lots (${FIELDS.join(',')}) VALUES (${FIELDS.map((field, index) => `$${index + 1}`).join(',')}) RETURNING id`,
    values
  );
  res.json({ id: result.rows[0].id });
});

app.put('/api/lots/:id', optionalAuth, admin, async (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const values = [...FIELDS.map(field => o[field]), Number(req.params.id)];
  const assignments = FIELDS.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const result = await db.query(
    `UPDATE lots SET ${assignments}, updated_at = now() WHERE id = $${values.length} RETURNING id`,
    values
  );
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Lot not found.' });
});

app.delete('/api/lots/:id', optionalAuth, admin, async (req, res) => {
  await deleteLot(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/me', optionalAuth, (req, res) => res.json({ admin: req.profile?.role === 'admin' }));

app.get('/api/admin/feedback', optionalAuth, admin, async (req, res) => {
  const average = await db.one(`SELECT COUNT(*)::int AS count,
    AVG(functionality) AS functionality, AVG(usability) AS usability,
    AVG(reliability) AS reliability, AVG(satisfaction) AS satisfaction FROM feedback`);
  const recent = await db.query(
    "SELECT role, comment, created_at FROM feedback WHERE comment <> '' ORDER BY id DESC LIMIT 10"
  );
  res.json({ avg: average, recent: recent.rows });
});

app.patch('/api/admin/lots/:id/approval', optionalAuth, admin, async (req, res) => {
  const approval = String(req.body?.approval || '');
  if (!['approved', 'rejected', 'pending'].includes(approval))
    return res.status(400).json({ error: 'Invalid value.' });
  const result = await db.query('UPDATE lots SET approval = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [approval, Number(req.params.id)]);
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Lot not found.' });
});

app.get('/api/seller/profile', optionalAuth, requireRole('seller'), async (req, res) => {
  const profile = await db.one(
    'SELECT name, email, phone, street, barangay, city, province, created_at FROM profiles WHERE id = $1',
    [req.profile.id]
  );
  res.json(profile);
});

app.patch('/api/seller/profile', optionalAuth, requireRole('seller'), async (req, res) => {
  let phone = String(req.body?.phone || '').replace(/[\s-]/g, '');
  if (phone.startsWith('+63')) phone = '0' + phone.slice(3);
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid mobile number, like 09171234567.' });
  await db.query('UPDATE profiles SET phone = $1 WHERE id = $2', [phone, req.profile.id]);
  res.json({ ok: true, phone });
});

app.get('/api/seller/lots', optionalAuth, requireRole('seller'), async (req, res) => {
  const result = await db.query('SELECT * FROM lots WHERE owner_id = $1 ORDER BY id DESC', [req.profile.id]);
  res.json(await withPhotos(result.rows));
});

app.post('/api/seller/lots', optionalAuth, requireRole('seller'), uploadPhotos, async (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const files = req.files || [];
  let paths;
  try {
    paths = await processPhotoFiles(files);
  } catch (error) {
    console.error('Photo processing failed:', error.message);
    return res.status(400).json({ error: 'Photos could not be processed. Use valid JPG, PNG, or WebP images.' });
  }
  try {
    const id = await db.transaction(async client => {
      const me = await client.query('SELECT name, phone FROM profiles WHERE id = $1', [req.profile.id]);
      o.seller_name = me.rows[0].name;
      o.seller_phone = me.rows[0].phone || '';
      const columns = [...FIELDS, 'owner_id', 'approval'];
      const values = [...FIELDS.map(field => o[field]), req.profile.id, 'pending'];
      const result = await client.query(
        `INSERT INTO lots (${columns.join(',')}) VALUES (${columns.map((field, index) => `$${index + 1}`).join(',')}) RETURNING id`,
        values
      );
      const lotId = result.rows[0].id;
      await insertPhotoRows(client, lotId, paths);
      return lotId;
    });
    res.json({ id });
  } catch (error) {
    await removeStorageObjects(paths);
    console.error('Listing creation failed:', error.message);
    res.status(500).json({ error: 'Could not save the listing. Please try again.' });
  }
});

app.put('/api/seller/lots/:id', optionalAuth, requireRole('seller'), uploadPhotos, async (req, res) => {
  const id = Number(req.params.id);
  const owned = await db.one('SELECT id FROM lots WHERE id = $1 AND owner_id = $2', [id, req.profile.id]);
  if (!owned) return res.status(404).json({ error: 'Lot not found.' });
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const existing = await db.query('SELECT id, filename FROM lot_photos WHERE lot_id = $1 ORDER BY sort_order, id', [id]);
  const removedIds = parseRemovedPhotos(req.body?.removePhotos);
  const removed = existing.rows.filter(photo => removedIds.includes(photo.id));
  const kept = existing.rows.filter(photo => !removedIds.includes(photo.id));
  const files = req.files || [];
  if (kept.length + files.length > MAX_PHOTOS)
    return res.status(400).json({ error: 'A listing can have up to 6 photos.' });

  let paths;
  try {
    paths = await processPhotoFiles(files);
  } catch (error) {
    console.error('Photo processing failed:', error.message);
    return res.status(400).json({ error: 'Photos could not be processed. Use valid JPG, PNG, or WebP images.' });
  }
  try {
    const updated = await db.transaction(async client => {
      const me = await client.query('SELECT name, phone FROM profiles WHERE id = $1', [req.profile.id]);
      o.seller_name = me.rows[0].name;
      o.seller_phone = me.rows[0].phone || '';
      const values = [...FIELDS.map(field => o[field]), id, req.profile.id];
      const assignments = FIELDS.map((field, index) => `${field} = $${index + 1}`).join(', ');
      const result = await client.query(
        `UPDATE lots SET ${assignments}, approval = 'pending', updated_at = now()
         WHERE id = $${values.length - 1} AND owner_id = $${values.length} RETURNING id`,
        values
      );
      if (!result.rowCount) return false;
      for (const photo of removed) {
        await client.query('DELETE FROM lot_photos WHERE id = $1 AND lot_id = $2', [photo.id, id]);
      }
      for (const [index, photo] of kept.entries()) {
        await client.query('UPDATE lot_photos SET sort_order = $1 WHERE id = $2 AND lot_id = $3', [index, photo.id, id]);
      }
      await insertPhotoRows(client, id, paths, kept.length);
      return true;
    });
    if (!updated) {
      await removeStorageObjects(paths);
      return res.status(404).json({ error: 'Lot not found.' });
    }
    await removeStorageObjects(removed.map(photo => photo.filename));
    res.json({ ok: true });
  } catch (error) {
    await removeStorageObjects(paths);
    console.error('Listing update failed:', error.message);
    res.status(500).json({ error: 'Could not update the listing. Please try again.' });
  }
});

app.patch('/api/seller/lots/:id/status', optionalAuth, requireRole('seller'), async (req, res) => {
  const status = String(req.body?.status || '');
  if (!STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const result = await db.query(
    "UPDATE lots SET status = $1, updated_at = now() WHERE id = $2 AND owner_id = $3 RETURNING id",
    [status, Number(req.params.id), req.profile.id]
  );
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Lot not found.' });
});

app.delete('/api/seller/lots/:id', optionalAuth, requireRole('seller'), async (req, res) => {
  const deleted = await deleteLot(Number(req.params.id), req.profile.id);
  if (!deleted) return res.status(404).json({ error: 'Lot not found.' });
  res.json({ ok: true });
});

app.get('/api/buyer/profile', optionalAuth, requireRole('buyer'), async (req, res) => {
  const profile = await db.one(
    'SELECT name, email, phone, street, barangay, city, province, created_at FROM profiles WHERE id = $1',
    [req.profile.id]
  );
  res.json(profile);
});

app.patch('/api/buyer/profile', optionalAuth, requireRole('buyer'), async (req, res) => {
  const t = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  let phone = String(req.body?.phone || '').replace(/[\s-]/g, '');
  if (phone.startsWith('+63')) phone = '0' + phone.slice(3);
  if (phone && !/^09\d{9}$/.test(phone))
    return res.status(400).json({ error: 'Enter a valid mobile number, like 09171234567.' });
  await db.query(
    'UPDATE profiles SET phone = $1, street = $2, barangay = $3, city = $4, province = $5 WHERE id = $6',
    [phone, t(req.body?.street), t(req.body?.barangay), t(req.body?.city), t(req.body?.province), req.profile.id]
  );
  res.json({ ok: true });
});

app.get('/api/buyer/favorites', optionalAuth, requireRole('buyer'), async (req, res) => {
  const result = await db.query(`SELECT l.* FROM favorites f JOIN lots l ON l.id = f.lot_id
    WHERE f.user_id = $1 AND l.approval = 'approved' ORDER BY f.created_at DESC`, [req.profile.id]);
  res.json(await withPhotos(result.rows));
});

app.post('/api/buyer/favorites/:id', optionalAuth, requireRole('buyer'), async (req, res) => {
  const id = Number(req.params.id);
  const lot = await db.one("SELECT id FROM lots WHERE id = $1 AND approval = 'approved'", [id]);
  if (!lot) return res.status(404).json({ error: 'Lot not found.' });
  await db.query('INSERT INTO favorites (user_id, lot_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.profile.id, id]);
  res.json({ ok: true });
});

app.delete('/api/buyer/favorites/:id', optionalAuth, requireRole('buyer'), async (req, res) => {
  await db.query('DELETE FROM favorites WHERE user_id = $1 AND lot_id = $2', [req.profile.id, Number(req.params.id)]);
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(DIST, 'index.html'), error => error && next());
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'The server could not complete the request.' });
});

async function start() {
  await db.one('SELECT 1');
  const users = await db.one('SELECT COUNT(*)::int AS count FROM profiles');
  const lots = await db.one('SELECT COUNT(*)::int AS count FROM lots');
  app.listen(process.env.PORT || 3000, () => {
    console.log(`AriLaya running at http://localhost:${process.env.PORT || 3000}`);
    console.log(`Stored records: ${users.count} profiles, ${lots.count} lots`);
  });
}

start().catch(error => {
  console.error('AriLaya could not start:', error.message);
  process.exit(1);
});
