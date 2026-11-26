require('dotenv').config();
const db = require('../db');

const landmarks = [
  ['Mamburao Municipal Hall', 'government', 13.226437, 120.594688],
  ['Mamburao Public Market', 'market', 13.224687, 120.591188],
  ['Mamburao Port', 'transport', 13.226938, 120.567437],
  ['Occidental Mindoro Capitol', 'government', 13.222062, 120.607312]
];
const rectangle = (lat, lng, dLat, dLng) => [
  { lat, lng }, { lat, lng: lng + dLng },
  { lat: lat + dLat, lng: lng + dLng }, { lat: lat + dLat, lng }
];
const lot = (title, barangay, road, landmark, price, type, status, lat, lng, dLat, dLng) => ({
  title, barangay, address: '', nearest_road: road, landmark, price,
  area_sqm: Math.round(dLat * 110574 * dLng * 108400), land_type: type, status,
  seller_name: 'Sample seller', seller_phone: '',
  description: 'Sample listing. Replace with real data.',
  boundary: rectangle(lat, lng, dLat, dLng),
  center_lat: lat + dLat / 2, center_lng: lng + dLng / 2
});
const lots = [
  lot('Residential lot near the market', 'Poblacion 1', 'National Highway', 'Mamburao Public Market', 1200000, 'residential', 'available', 13.2218, 120.5955, 0.00018, 0.00023),
  lot('Corner lot near Municipal Hall', 'Poblacion 3', 'Rizal Street', 'Mamburao Municipal Hall', 2500000, 'commercial', 'reserved', 13.2238, 120.5968, 0.00020, 0.00025),
  lot('Farm lot, Payompon', 'Payompon', 'Barangay Road', '', 800000, 'agricultural', 'available', 13.2150, 120.6020, 0.00060, 0.00080)
];

async function main() {
  await db.transaction(async client => {
    const landmarkCount = (await client.query('SELECT COUNT(*)::int AS count FROM landmarks')).rows[0].count;
    if (!landmarkCount) {
      for (const item of landmarks) {
        await client.query('INSERT INTO landmarks (name, category, lat, lng) VALUES ($1,$2,$3,$4)', item);
      }
    }
    const lotCount = (await client.query('SELECT COUNT(*)::int AS count FROM lots')).rows[0].count;
    if (!lotCount) {
      for (const item of lots) {
        const fields = Object.keys(item);
        await client.query(`INSERT INTO lots (${fields.join(',')}) VALUES (${fields.map((field, index) => `$${index + 1}`).join(',')})`,
          fields.map(field => field === 'boundary' ? JSON.stringify(item[field]) : item[field]));
      }
    }
  });
  console.log('Seed complete.');
}

main().catch(error => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await db.pool.end();
});
