import { api } from './api'
import { getSupabase } from './supabase'

let map, poly, pts = [], vtx = [], lots = [], editing = null, others, started = false;
let reviewFilter = 'pending', reviewQuery = '';
const FIELDS = ['title', 'barangay', 'land_type', 'price', 'status', 'address', 'nearest_road', 'landmark',
  'seller_name', 'seller_phone', 'description'];
const COLORS = { available: '#0f6e56', reserved: '#ba7517', sold: '#888780' };

function showMessage(text, ok = true) {
  $('msg').innerHTML = `<div class="${ok ? 'ok' : 'err'}">${esc(text)}</div>`;
}

async function runAction(button, task) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await task();
  } catch (err) {
    showMessage(err.message, false);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function boot() {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      $('login').classList.remove('hidden');
      return;
    }
    const me = await api('/api/admin/me');
    if (me.admin) start();
    else {
      await supabase.auth.signOut();
      $('login').classList.remove('hidden');
    }
  } catch (err) {
    $('login').classList.remove('hidden');
    $('l-msg').innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}

$('login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Signing in…';
  $('l-msg').innerHTML = '';
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: $('l-user').value.trim(), password: $('l-pass').value });
    if (error) throw new Error(error.message);
    const me = await api('/api/admin/me');
    if (!me.admin) {
      await supabase.auth.signOut();
      throw new Error('This account does not have admin access.');
    }
    start();
  } catch (err) {
    $('l-msg').innerHTML = `<div class="err">${esc(err.message)}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
$('logout').onclick = async () => {
  $('logout').disabled = true;
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } finally { location.reload(); }
};

async function start() {
  if (started) return;
  started = true;
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  fillSelect($('a-barangay'), BARANGAYS);
  fillSelect($('a-land_type'), LAND_TYPES);
  fillSelect($('a-status'), ['available', 'reserved', 'sold']);
  map = makeMap('map', 15);
  others = L.layerGroup().addTo(map);
  poly = L.polygon([], { color: '#ffeb3b', weight: 3, fillOpacity: 0.35, interactive: false }).addTo(map);
  map.on('click', event => { pts.push({ lat: event.latlng.lat, lng: event.latlng.lng }); redraw(); });
  $('undo').onclick = () => { pts.pop(); redraw(); };
  $('clear').onclick = () => { pts = []; redraw(); };
  $('new').onclick = resetForm;
  $('save').onclick = save;
  $('tbl').onclick = onTable;
  $('review-search').oninput = event => { reviewQuery = event.target.value.trim().toLowerCase(); renderLots(); };
  $('review-filter').onchange = event => { reviewFilter = event.target.value; renderLots(); };
  $('photo-dialog-close').onclick = () => $('photo-dialog').close();
  $('photo-dialog').addEventListener('click', event => { if (event.target === $('photo-dialog')) $('photo-dialog').close(); });
  resetForm();
  await loadLots();
  loadFeedback();
}

function redraw() {
  vtx.forEach(marker => marker.remove());
  vtx = pts.map((point, index) => {
    const marker = L.marker([point.lat, point.lng], { draggable: true, icon: L.divIcon({ className: 'vtx', iconSize: [14, 14] }) }).addTo(map);
    marker.on('drag', event => {
      const ll = event.target.getLatLng();
      pts[index] = { lat: ll.lat, lng: ll.lng };
      poly.setLatLngs(toLL(pts));
      updArea();
    });
    return marker;
  });
  poly.setLatLngs(toLL(pts));
  updArea();
}

function updArea() {
  $('area').textContent = pts.length >= 3
    ? `${pts.length} points · area ≈ ${Math.round(areaSqm(pts))} m²`
    : `${pts.length} point(s) placed (need at least 3)`;
}

function visibleLots() {
  return lots.filter(lot => {
    const approval = lot.approval || 'approved';
    const matchesReview = reviewFilter === 'all' || approval === reviewFilter;
    const haystack = [lot.title, lot.barangay, lot.seller_name, lot.nearest_road, lot.landmark].join(' ').toLowerCase();
    return matchesReview && (!reviewQuery || haystack.includes(reviewQuery));
  });
}

function mapStyle(lot) {
  const approval = lot.approval || 'approved';
  if (approval === 'pending') return { color: '#ba7517', fillColor: '#ba7517', fillOpacity: 0.22, weight: 2, dashArray: '6' };
  if (approval === 'rejected') return { color: '#a32d2d', fillColor: '#a32d2d', fillOpacity: 0.18, weight: 2, dashArray: '3 6' };
  return { color: COLORS[lot.status], fillColor: COLORS[lot.status], fillOpacity: 0.25, weight: 1.5 };
}

async function loadLots() {
  $('review-count').textContent = 'Loading…';
  try {
    lots = await api('/api/lots');
    renderLots();
  } catch (err) {
    $('review-count').textContent = 'Unavailable';
    $('tbl').innerHTML = `<tr><td><div class="err">${esc(err.message)}</div></td></tr>`;
  }
}

function renderLots() {
  const visible = visibleLots();
  others.clearLayers();
  visible.forEach(lot => L.polygon(toLL(lot.boundary), { ...mapStyle(lot), bubblingMouseEvents: false })
    .on('click', () => edit(lot.id)).addTo(others));
  $('review-count').textContent = `${visible.length} shown`;
  if (visible.length === 0) {
    $('tbl').innerHTML = '<tr><td><div class="admin-empty">No listings match this review filter.</div></td></tr>';
    return;
  }
  $('tbl').innerHTML = '<tr><th scope="col">Lot</th><th scope="col">Review</th><th scope="col">Updated</th><th scope="col">Actions</th></tr>' + visible.map(lot => {
    const approval = lot.approval || 'approved';
    const photo = lot.photos?.[0]?.url;
    const photoCount = lot.photos?.length || 0;
    const updated = String(lot.updated_at || lot.created_at || '').slice(0, 10);
    return `<tr>
      <td><div class="admin-lot">${photo ? `<img src="${esc(photo)}" alt="" width="72" height="54" loading="lazy">` : '<span class="admin-no-photo">No photo</span>'}<div><strong>${esc(lot.title)}</strong><br><span class="mu">${esc(lot.barangay)} · ${peso(lot.price)} · ${lot.status}</span></div></div></td>
      <td><span class="badge ${approval}">${esc(approval)}</span></td>
      <td><span class="mu">${esc(updated || '-')}</span></td>
      <td><div class="admin-row-actions">${approval !== 'approved' ? `<button data-act="approve" data-id="${lot.id}">Approve</button>` : ''}${approval === 'pending' ? `<button data-act="reject" data-id="${lot.id}">Reject</button>` : ''}<button data-act="photos" data-id="${lot.id}" ${photoCount ? '' : 'disabled'}>Photos (${photoCount})</button><button data-act="edit" data-id="${lot.id}">Edit</button><button class="del" data-act="del" data-id="${lot.id}">Delete</button></div></td>
    </tr>`;
  }).join('');
}

function onTable(event) {
  const button = event.target.closest('button[data-act]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.act;
  if (action === 'edit') edit(id);
  if (action === 'photos') openPhotos(id);
  if (action === 'approve' || action === 'reject') {
    runAction(button, async () => {
      await api('/api/admin/lots/' + id + '/approval', { method: 'PATCH', body: { approval: action === 'approve' ? 'approved' : 'rejected' } });
      await loadLots();
    });
  }
  if (action === 'del' && confirm('Delete this lot permanently?')) {
    runAction(button, async () => {
      await api('/api/lots/' + id, { method: 'DELETE' });
      if (editing === id) resetForm();
      await loadLots();
    });
  }
}

function openPhotos(id) {
  const lot = lots.find(item => item.id === id);
  if (!lot?.photos?.length) return;
  $('photo-dialog-title').textContent = lot.title;
  $('photo-dialog-grid').innerHTML = lot.photos.map((photo, index) => `<a href="${esc(photo.url)}" target="_blank" rel="noopener"><img src="${esc(photo.url)}" alt="${esc(lot.title)}, photo ${index + 1}" loading="lazy"></a>`).join('');
  $('photo-dialog').showModal();
}

function edit(id) {
  const lot = lots.find(item => item.id === id);
  if (!lot) return;
  editing = id;
  $('form-title').textContent = 'Edit lot #' + id;
  FIELDS.forEach(field => { $('a-' + field).value = lot[field] ?? ''; });
  pts = lot.boundary.map(point => ({ lat: point.lat, lng: point.lng }));
  redraw();
  map.fitBounds(poly.getBounds(), { maxZoom: 19, padding: [40, 40] });
  $('msg').innerHTML = '';
  document.querySelector('.admin-form-section')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function resetForm() {
  editing = null;
  $('form-title').textContent = 'Add a lot';
  FIELDS.forEach(field => { $('a-' + field).value = field === 'barangay' ? BARANGAYS[0] : field === 'land_type' ? 'residential' : field === 'status' ? 'available' : ''; });
  pts = [];
  redraw();
  $('msg').innerHTML = '';
}

function save() {
  if (pts.length < 3) {
    showMessage('Place at least 3 boundary points before saving.', false);
    return;
  }
  const body = { boundary: pts };
  FIELDS.forEach(field => { body[field] = $('a-' + field).value; });
  body.area_sqm = Math.round(areaSqm(pts) * 10) / 10;
  body.center_lat = pts.reduce((sum, point) => sum + point.lat, 0) / pts.length;
  body.center_lng = pts.reduce((sum, point) => sum + point.lng, 0) / pts.length;
  runAction($('save'), async () => {
    if (editing) await api('/api/lots/' + editing, { method: 'PUT', body });
    else await api('/api/lots', { method: 'POST', body });
    showMessage('Saved.');
    resetForm();
    await loadLots();
  });
}

async function loadFeedback() {
  $('fbsum').innerHTML = 'Loading…';
  try {
    const { avg, recent } = await api('/api/admin/feedback');
    const format = key => avg[key] ? Number(avg[key]).toFixed(2) : '-';
    $('fbsum').innerHTML = `<div class="admin-feedback-summary">Responses: <b>${Number(avg.count || 0)}</b><table>
      <tr><td>Functionality</td><td>${format('functionality')} / 5</td></tr><tr><td>Usability</td><td>${format('usability')} / 5</td></tr>
      <tr><td>Reliability</td><td>${format('reliability')} / 5</td></tr><tr><td>Satisfaction</td><td>${format('satisfaction')} / 5</td></tr></table></div>` +
      (recent.length ? recent.map(item => `<article class="admin-feedback-item"><p>“${esc(item.comment)}”</p><span>${esc(item.role)} · ${esc(String(item.created_at || '').slice(0, 10) || 'Date unavailable')}</span></article>`).join('') : '<p class="admin-empty">No feedback yet.</p>');
  } catch (err) {
    $('fbsum').innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}

boot();
