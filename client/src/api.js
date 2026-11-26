import { getAccessToken } from './supabase'

export async function api(url, opts) {
  const isForm = opts?.body instanceof FormData
  const token = await getAccessToken()
  const headers = isForm ? {} : { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const init = opts ? {
    method: opts.method,
    headers,
    body: isForm ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined
  } : { headers }
  const r = await fetch(url, init)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

export const peso = n => '₱' + Number(n).toLocaleString('en-PH')
export const BARANGAYS = ['Balansay', 'Fatima', 'Payompon', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3',
  'Poblacion 4', 'Poblacion 5', 'Poblacion 6', 'Poblacion 7', 'Poblacion 8', 'San Luis', 'Talabaan',
  'Tangkalan', 'Tayamaan']
export const LAND_TYPES = ['residential', 'agricultural', 'commercial', 'industrial']
export const MAMBURAO = [13.2233, 120.596]
export const toLL = b => b.map(p => [p.lat, p.lng])

export function distM(a, b) {
  const R = 6371008.8, r = x => x * Math.PI / 180
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const sideLengths = b => b.map((a, i) => distM(a, b[(i + 1) % b.length]))

export function areaSqm(b) {
  if (b.length < 3) return 0
  const o = b[0], kx = 111320 * Math.cos(o.lat * Math.PI / 180), ky = 110574
  const xy = b.map(p => [(p.lng - o.lng) * kx, (p.lat - o.lat) * ky])
  let s = 0
  xy.forEach((a, i) => { const c = xy[(i + 1) % xy.length]; s += a[0] * c[1] - c[0] * a[1] })
  return Math.abs(s) / 2
}