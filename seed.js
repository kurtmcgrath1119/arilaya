
const db = require('./db');

const landmarks = [
  ['Mamburao Municipal Hall', 'government', 13.226437, 120.594688],
  ['Mamburao Public Market', 'market', 13.224687, 120.591188],
  ['Mamburao Port', 'transport', 13.226938, 120.567437],
  ['Occidental Mindoro Capitol', 'government', 13.222062, 120.607312]
];

const rect = (lat, lng, dLat, dLng) => [
  { lat, lng }, { lat, lng: lng + dLng },
  { lat: lat + dLat, lng: lng + dLng }, { lat: lat + dLat, lng }
];
const mk = (title, brgy, road, lm, price, type, status, lat, lng, dLat, dLng) => ({
  title, barangay: brgy, address: '', nearest_road: road, landmark: lm, price,
  area_sqm: Math.round(dLat * 110574 * dLng * 108400), land_type: type, status,
  seller_name: 'SELLER #1', seller_phone: '09177627181',
  description: 'Sample listing. Replace with real data.',
  boundary: JSON.stringify(rect(lat, lng, dLat, dLng)),
  center_lat: lat + dLat / 2, center_lng: lng + dLng / 2
});
const lots = [
  mk('Residential lot near the market', 'Poblacion 1', 'National Highway', 'Mamburao Public Market', 1200000, 'residential', 'available', 13.2218, 120.5955, 0.00018, 0.00023),
  mk('Corner lot near Municipal Hall', 'Poblacion 3', 'Rizal Street', 'Mamburao Municipal Hall', 2500000, 'commercial', 'reserved', 13.2238, 120.5968, 0.00020, 0.00025),
  mk('Farm lot, Payompon', 'Payompon', 'Barangay Road', '', 800000, 'agricultural', 'available', 13.2150, 120.6020, 0.00060, 0.00080)
];
if (db.prepare('SELECT COUNT(*) c FROM landmarks').get().c === 0) {
  const s = db.prepare('INSERT INTO landmarks (name,category,lat,lng) VALUES (?,?,?,?)');
  landmarks.forEach(l => s.run(...l));
}
if (db.prepare('SELECT COUNT(*) c FROM lots').get().c === 0) {
  const cols = Object.keys(lots[0]);
  const s = db.prepare(`INSERT INTO lots (${cols.join(',')}) VALUES (${cols.map(c => '@' + c).join(',')})`);
  lots.forEach(l => s.run(l));
}
console.log('Seed complete.');
