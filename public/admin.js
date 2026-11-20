let map, poly, pts = [], vtx = [], lots = [], editing = null, others;
const FIELDS = ['title', 'barangay', 'land_type', 'price', 'status', 'address', 'nearest_road', 'landmark',
  'seller_name', 'seller_phone', 'description'];
const COLORS = { available: '#0f6e56', reserved: '#ba7517', sold: '#888780' };

async function boot() {
  const me = await api('/api/admin/me');
  me.admin ? start() : $('login').classList.remove('hidden');
}
$('login').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/api/admin/login', { method: 'POST', body: { username: $('l-user').value, password: $('l-pass').value } }); start(); }
  catch (err) { $('l-msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
});
$('logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };

async function start() {
  $('login').classList.add('hidden'); $('app').classList.remove('hidden'); $('logout').classList.remove('hidden');
  fillSelect($('a-barangay'), BARANGAYS); fillSelect($('a-land_type'), LAND_TYPES);
  fillSelect($('a-status'), ['available', 'reserved', 'sold']);
  map = makeMap('map', 15);
  others = L.layerGroup().addTo(map);
  poly = L.polygon([], { color: '#ffeb3b', weight: 3, fillOpacity: 0.35, interactive: false }).addTo(map);
  map.on('click', e => { pts.push({ lat: e.latlng.lat, lng: e.latlng.lng }); redraw(); });
  $('undo').onclick = () => { pts.pop(); redraw(); };
  $('clear').onclick = () => { pts = []; redraw(); };
  $('new').onclick = resetForm;
  $('save').onclick = save;
  $('tbl').onclick = onTable;
  redraw(); await loadLots(); loadFeedback();
}

function redraw() {
  vtx.forEach(m => m.remove());
  vtx = pts.map((p, i) => {
    const m = L.marker([p.lat, p.lng], { draggable: true, icon: L.divIcon({ className: 'vtx', iconSize: [14, 14] }) }).addTo(map);
    m.on('drag', e => { const ll = e.target.getLatLng(); pts[i] = { lat: ll.lat, lng: ll.lng }; poly.setLatLngs(toLL(pts)); updArea(); });
    return m;
  });
  poly.setLatLngs(toLL(pts)); updArea();
}
function updArea() {
  $('area').textContent = pts.length >= 3
    ? `${pts.length} points · area ≈ ${Math.round(areaSqm(pts))} m²`
    : `${pts.length} point(s) placed (need at least 3)`;
}

async function loadLots() {
  lots = await api('/api/lots');
  others.clearLayers();
  lots.forEach(l => L.polygon(toLL(l.boundary), { color: COLORS[l.status], fillColor: COLORS[l.status], fillOpacity: 0.25,
    weight: 1.5, bubblingMouseEvents: false }).on('click', () => edit(l.id)).addTo(others));
  $('tbl').innerHTML = '<tr><th>Lot</th><th>Review</th><th></th></tr>' + lots.map(l => {
    const ap = l.approval || 'approved';
    return `<tr><td>${esc(l.title)}<br><span class="mu">${esc(l.barangay)} · ${peso(l.price)} · ${l.status}</span></td>
      <td>${ap}</td>
      <td>${ap !== 'approved' ? `<button data-act="approve" data-id="${l.id}">Approve</button> ` : ''}${ap === 'pending' ? `<button data-act="reject" data-id="${l.id}">Reject</button> ` : ''}<button data-act="edit" data-id="${l.id}">Edit</button> <button class="del" data-act="del" data-id="${l.id}">Delete</button></td></tr>`;
  }).join('');
}
function onTable(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = Number(b.dataset.id), act = b.dataset.act;
  if (act === 'edit') edit(id);
  if (act === 'approve' || act === 'reject')
    api('/api/admin/lots/' + id + '/approval', { method: 'PATCH', body: { approval: act === 'approve' ? 'approved' : 'rejected' } }).then(loadLots);
  if (act === 'del' && confirm('Delete this lot permanently?'))
    api('/api/lots/' + id, { method: 'DELETE' }).then(() => { if (editing === id) resetForm(); loadLots(); });
}
function edit(id) {
  const l = lots.find(x => x.id === id); if (!l) return;
  editing = id; $('form-title').textContent = 'Edit lot #' + id;
  FIELDS.forEach(f => $('a-' + f).value = l[f] ?? '');
  pts = l.boundary.map(p => ({ lat: p.lat, lng: p.lng })); redraw();
  map.fitBounds(poly.getBounds(), { maxZoom: 19, padding: [40, 40] });
  $('msg').innerHTML = '';
}
function resetForm() {
  editing = null; $('form-title').textContent = 'Add a lot';
  FIELDS.forEach(f => $('a-' + f).value = f === 'barangay' ? BARANGAYS[0] : f === 'land_type' ? 'residential' : f === 'status' ? 'available' : '');
  pts = []; redraw(); $('msg').innerHTML = '';
}
async function save() {
  const body = { boundary: pts };
  FIELDS.forEach(f => body[f] = $('a-' + f).value);
  if (pts.length >= 3) {
    body.area_sqm = Math.round(areaSqm(pts) * 10) / 10;
    body.center_lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    body.center_lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  }
  try {
    editing ? await api('/api/lots/' + editing, { method: 'PUT', body }) : await api('/api/lots', { method: 'POST', body });
    $('msg').innerHTML = '<div class="ok">Saved.</div>'; resetForm(); loadLots();
  } catch (err) { $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
}
async function loadFeedback() {
  const { avg, recent } = await api('/api/admin/feedback');
  const f = n => avg[n] ? Number(avg[n]).toFixed(2) : '-';
  $('fbsum').innerHTML = `Responses: <b>${avg.count}</b><table>
    <tr><td>Functionality</td><td>${f('functionality')} / 5</td></tr><tr><td>Usability</td><td>${f('usability')} / 5</td></tr>
    <tr><td>Reliability</td><td>${f('reliability')} / 5</td></tr><tr><td>Satisfaction</td><td>${f('satisfaction')} / 5</td></tr></table>` +
    recent.map(r => `<p>“${esc(r.comment)}” <span class="mu">– ${esc(r.role)}</span></p>`).join('');
}
boot();
