const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = n => '₱' + Number(n).toLocaleString('en-PH');
const BARANGAYS = ['Balansay', 'Fatima', 'Payompon', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Poblacion 4',
  'Poblacion 5', 'Poblacion 6', 'Poblacion 7', 'Poblacion 8', 'San Luis', 'Talabaan', 'Tangkalan', 'Tayamaan'];
const LAND_TYPES = ['residential', 'agricultural', 'commercial', 'industrial'];
const MAMBURAO = [13.2233, 120.596];

async function api(url, opts) {
  const init = opts ? { method: opts.method, headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined } : undefined;
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
function fillSelect(el, items, first) {
  el.innerHTML = (first ? `<option value="">${first}</option>` : '') +
    items.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
}

// ---------- Map setup (Leaflet + OpenStreetMap / Esri satellite) ----------
function makeMap(elId, zoom) {
  const map = L.map(elId).setView(MAMBURAO, zoom);
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Tiles &copy; Esri' });
  street.addTo(map);
  L.control.layers({ Street: street, Satellite: sat }).addTo(map);
  return map;
}
const toLL = b => b.map(p => [p.lat, p.lng]);

// ---------- Geometry helpers (no Google library needed) ----------
function distM(a, b) {                         // haversine distance in meters
  const R = 6371008.8, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function areaSqm(b) {                          // polygon area in m² (local flat projection)
  if (b.length < 3) return 0;
  const o = b[0], kx = 111320 * Math.cos(o.lat * Math.PI / 180), ky = 110574;
  const xy = b.map(p => [(p.lng - o.lng) * kx, (p.lat - o.lat) * ky]);
  let s = 0;
  xy.forEach((a, i) => { const c = xy[(i + 1) % xy.length]; s += a[0] * c[1] - c[0] * a[1]; });
  return Math.abs(s) / 2;
}
const sideLengths = b => b.map((a, i) => distM(a, b[(i + 1) % b.length]));
