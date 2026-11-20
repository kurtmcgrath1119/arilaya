require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret',
  resave: false, saveUninitialized: false,
   cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto' }
}));
const DIST = path.join(__dirname, 'client', 'dist');
app.use(express.static(DIST));                             
app.use(express.static(path.join(__dirname, 'public')));   

const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
const admin = (req, res, next) => req.session.admin ? next() : res.status(401).json({ error: 'Login required' });
const parse = r => ({ ...r, boundary: JSON.parse(r.boundary) });

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
  const bd = Array.isArray(b.boundary) ? b.boundary : [];
  if (bd.length < 3 || bd.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng)))
    return { error: 'Mark at least 3 boundary points on the map.' };
  if (!Number.isFinite(o.center_lat) || !Number.isFinite(o.center_lng)) return { error: 'Invalid map location.' };
  o.boundary = JSON.stringify(bd.map(p => ({ lat: p.lat, lng: p.lng })));
  return { o };
}

// ---------- Public API ----------
app.get('/api/lots', (req, res) => {
  const rows = req.session.admin
    ? db.prepare('SELECT * FROM lots ORDER BY id DESC').all()
    : db.prepare("SELECT * FROM lots WHERE approval='approved' ORDER BY id DESC").all();
  res.json(rows.map(parse));
});
app.get('/api/landmarks', (req, res) =>
  res.json(db.prepare('SELECT * FROM landmarks ORDER BY name').all()));

app.post('/api/feedback', (req, res) => {
  const b = req.body || {};
  const r = k => { const n = Number(b[k]); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
  const f = { functionality: r('functionality'), usability: r('usability'),
    reliability: r('reliability'), satisfaction: r('satisfaction') };
  if (Object.values(f).some(v => v === null)) return res.status(400).json({ error: 'Rate all four items from 1 to 5.' });
  const role = ['buyer', 'stakeholder'].includes(b.role) ? b.role : 'buyer';
  db.prepare('INSERT INTO feedback (role,functionality,usability,reliability,satisfaction,comment) VALUES (?,?,?,?,?,?)')
    .run(role, f.functionality, f.usability, f.reliability, f.satisfaction, String(b.comment || '').slice(0, 1000));
  res.json({ ok: true });
});

// ---------- Admin API ----------
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = process.env.ADMIN_USERNAME, p = process.env.ADMIN_PASSWORD;
  if (u && p && same(username, u) && same(password, p)) { req.session.admin = true; return res.json({ ok: true }); }
  res.status(401).json({ error: 'Wrong username or password.' });
});
app.post('/api/admin/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/admin/me', (req, res) => res.json({ admin: !!req.session.admin }));

app.post('/api/lots', admin, (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const r = db.prepare(`INSERT INTO lots (${FIELDS.join(',')}) VALUES (${FIELDS.map(f => '@' + f).join(',')})`).run(o);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/lots/:id', admin, (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const r = db.prepare(`UPDATE lots SET ${FIELDS.map(f => f + '=@' + f).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=@id`)
    .run({ ...o, id: Number(req.params.id) });
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Lot not found.' });
});
app.delete('/api/lots/:id', admin, (req, res) => {
  db.prepare('DELETE FROM lots WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});
app.get('/api/admin/feedback', admin, (req, res) => {
  const avg = db.prepare(`SELECT COUNT(*) count, AVG(functionality) functionality, AVG(usability) usability,
    AVG(reliability) reliability, AVG(satisfaction) satisfaction FROM feedback`).get();
  const recent = db.prepare('SELECT role,comment,created_at FROM feedback WHERE comment<>\'\' ORDER BY id DESC LIMIT 10').all();
  res.json({ avg, recent });
});

//google login

const { OAuth2Client } = require('google-auth-library');
const gClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.get('/api/auth/config', (req, res) =>
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, role } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
    const ticket = await gClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p.email_verified) return res.status(400).json({ error: 'Your Google email is not verified.' });

    let u = db.prepare('SELECT * FROM users WHERE google_sub=?').get(p.sub);
    if (!u) {
      if (!['buyer', 'seller'].includes(role)) return res.status(400).json({ error: 'Choose buyer or seller.' });
      const r = db.prepare('INSERT INTO users (google_sub,email,name,picture,role) VALUES (?,?,?,?,?)')
        .run(p.sub, p.email, p.name || p.email, p.picture || '', role);
      u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    } else if (role && role !== u.role) {
      return res.status(403).json({ error: `This account is registered as a ${u.role}. Please sign in as a ${u.role}.` });
    }
    req.session.user = { id: u.id, name: u.name, email: u.email, picture: u.picture, role: u.role };
    res.json({ user: req.session.user });
  } catch (e) {
    res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/auth/logout', (req, res) => { delete req.session.user; res.json({ ok: true }); });


// ---------- Email + password accounts ----------
const scryptHash = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
const sessionUser = (id, name, email, picture, role) => ({ id, name, email, picture: picture || '', role });

app.post('/api/auth/register', (req, res) => {
  const b = req.body || {};
  const t = x => String(x ?? '').trim();
  const first = t(b.firstName), last = t(b.lastName);
  const email = t(b.email).toLowerCase();
  let phone = t(b.phone).replace(/[\s-]/g, '');
  if (phone.startsWith('+63')) phone = '0' + phone.slice(3);
  const street = t(b.street), barangay = t(b.barangay), city = t(b.city), province = t(b.province);

  if (!first || !last) return res.status(400).json({ error: 'Enter your first name and last name.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid mobile number, like 09171234567.' });
  if (!street || !barangay || !city || !province) return res.status(400).json({ error: 'Complete your address.' });
  if (String(b.password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!['buyer', 'seller'].includes(b.role)) return res.status(400).json({ error: 'Choose buyer or seller.' });
  if (db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email))
    return res.status(409).json({ error: 'That email is already registered. Try logging in.' });

  const salt = crypto.randomBytes(16).toString('hex');
  const stored = salt + ':' + scryptHash(b.password, salt);
  const name = `${first} ${last}`;
  const r = db.prepare(`INSERT INTO users
    (google_sub,email,name,picture,role,password_hash,first_name,last_name,phone,street,barangay,city,province)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('local:' + email, email, name, '', b.role, stored, first, last, phone, street, barangay, city, province);
  req.session.user = sessionUser(r.lastInsertRowid, name, email, '', b.role);
  res.json({ user: req.session.user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=? AND password_hash IS NOT NULL')
    .get(String(email || '').trim().toLowerCase());
  let ok = false;
  if (u) {
    const [salt, h] = u.password_hash.split(':');
    ok = crypto.timingSafeEqual(Buffer.from(scryptHash(password, salt), 'hex'), Buffer.from(h, 'hex'));
  }
  if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
  if (role && role !== u.role) return res.status(403).json({ error: `This account is registered as a ${u.role}. Please choose ${u.role}.` });
  req.session.user = sessionUser(u.id, u.name, u.email, u.picture, u.role);
  res.json({ user: req.session.user });
});



const seller = (req, res, next) =>
  req.session.user && req.session.user.role === 'seller' ? next() : res.status(401).json({ error: 'Seller login required' });

app.get('/api/seller/profile', seller, (req, res) => {
  res.json(db.prepare('SELECT name,email,phone,street,barangay,city,province,created_at FROM users WHERE id=?').get(req.session.user.id));
});

app.patch('/api/seller/profile', seller, (req, res) => {
  let phone = String(req.body?.phone || '').replace(/[\s-]/g, '');
  if (phone.startsWith('+63')) phone = '0' + phone.slice(3);
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid mobile number, like 09171234567.' });
  db.prepare('UPDATE users SET phone=? WHERE id=?').run(phone, req.session.user.id);
  res.json({ ok: true, phone });
});

app.get('/api/seller/lots', seller, (req, res) =>
  res.json(db.prepare('SELECT * FROM lots WHERE owner_id=? ORDER BY id DESC').all(req.session.user.id).map(parse)));

app.post('/api/seller/lots', seller, (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const me = db.prepare('SELECT name,phone FROM users WHERE id=?').get(req.session.user.id);
  o.seller_name = me.name; o.seller_phone = me.phone || '';
  o.owner_id = req.session.user.id; o.approval = 'pending';
  const cols = [...FIELDS, 'owner_id', 'approval'];
  const r = db.prepare(`INSERT INTO lots (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`).run(o);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/seller/lots/:id', seller, (req, res) => {
  const { o, error } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  const me = db.prepare('SELECT name,phone FROM users WHERE id=?').get(req.session.user.id);
  o.seller_name = me.name; o.seller_phone = me.phone || '';
  const r = db.prepare(`UPDATE lots SET ${FIELDS.map(f => f + '=@' + f).join(',')}, approval='pending',
    updated_at=CURRENT_TIMESTAMP WHERE id=@id AND owner_id=@owner`)
    .run({ ...o, id: Number(req.params.id), owner: req.session.user.id });
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Lot not found.' });
});

app.patch('/api/seller/lots/:id/status', seller, (req, res) => {
  const s = String(req.body?.status || '');
  if (!STATUS.includes(s)) return res.status(400).json({ error: 'Invalid status.' });
  const r = db.prepare('UPDATE lots SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?')
    .run(s, Number(req.params.id), req.session.user.id);
  r.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Lot not found.' });
});

app.delete('/api/seller/lots/:id', seller, (req, res) => {
  db.prepare('DELETE FROM lots WHERE id=? AND owner_id=?').run(Number(req.params.id), req.session.user.id);
  res.json({ ok: true });
});

// admin approves or rejects seller listings
app.patch('/api/admin/lots/:id/approval', admin, (req, res) => {
  const a = String(req.body?.approval || '');
  if (!['approved', 'rejected', 'pending'].includes(a)) return res.status(400).json({ error: 'Invalid value.' });
  db.prepare('UPDATE lots SET approval=? WHERE id=?').run(a, Number(req.params.id));
  res.json({ ok: true });
});





const buyer = (req, res, next) =>
  req.session.user && req.session.user.role === 'buyer' ? next() : res.status(401).json({ error: 'Buyer login required' });

app.get('/api/buyer/profile', buyer, (req, res) =>
  res.json(db.prepare('SELECT name,email,phone,street,barangay,city,province,created_at FROM users WHERE id=?').get(req.session.user.id)));

app.patch('/api/buyer/profile', buyer, (req, res) => {
  const t = (x, n = 120) => String(x ?? '').trim().slice(0, n);
  let phone = String(req.body?.phone || '').replace(/[\s-]/g, '');
  if (phone.startsWith('+63')) phone = '0' + phone.slice(3);
  if (phone && !/^09\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid mobile number, like 09171234567.' });
  db.prepare('UPDATE users SET phone=?, street=?, barangay=?, city=?, province=? WHERE id=?')
    .run(phone, t(req.body?.street), t(req.body?.barangay), t(req.body?.city), t(req.body?.province), req.session.user.id);
  res.json({ ok: true });
});

app.get('/api/buyer/favorites', buyer, (req, res) => {
  const rows = db.prepare(`SELECT l.* FROM favorites f JOIN lots l ON l.id = f.lot_id
    WHERE f.user_id = ? AND l.approval = 'approved' ORDER BY f.created_at DESC`).all(req.session.user.id);
  res.json(rows.map(parse));
});

app.post('/api/buyer/favorites/:id', buyer, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare("SELECT id FROM lots WHERE id=? AND approval='approved'").get(id))
    return res.status(404).json({ error: 'Lot not found.' });
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, lot_id) VALUES (?, ?)').run(req.session.user.id, id);
  res.json({ ok: true });
});

app.delete('/api/buyer/favorites/:id', buyer, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id=? AND lot_id=?').run(req.session.user.id, Number(req.params.id));
  res.json({ ok: true });
});


app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  res.sendFile(path.join(DIST, 'index.html'), err => err && next());
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AriLaya running at http://localhost:${PORT}`));
