import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, LayersControl, Polygon, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { api, peso, toLL, distM, sideLengths, BARANGAYS, LAND_TYPES, MAMBURAO } from '../api'
import { useAuth } from '../AuthContext'
import Header from '../Header'

const COLORS = { available: '#6fb11f', reserved: '#ba7517', sold: '#888780' }
const EMPTY = { q: '', brgy: '', lm: '', pmin: '', pmax: '', smin: '', smax: '', type: '', status: '' }
const RATINGS = ['functionality', 'usability', 'reliability', 'satisfaction']
const START = { role: 'buyer', functionality: '', usability: '', reliability: '', satisfaction: '', comment: '' }

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    if (target.bounds) map.fitBounds(target.bounds, { maxZoom: 19, padding: [40, 40] })
    else if (target.center) map.setView(target.center, 16)
  }, [target, map])
  return null
}

function Feedback() {
  const [v, setV] = useState(START)
  const [msg, setMsg] = useState(null)
  const set = k => e => setV({ ...v, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    try {
      const body = { role: v.role, comment: v.comment, ...Object.fromEntries(RATINGS.map(k => [k, Number(v[k])])) }
      await api('/api/feedback', { method: 'POST', body })
      setMsg({ ok: true, text: 'Thank you for your feedback!' }); setV(START)
    } catch (err) { setMsg({ ok: false, text: err.message }) }
  }
  return (
    <details>
      <summary>Rate this system</summary>
      <form onSubmit={submit}>
        <label>I am a</label>
        <select value={v.role} onChange={set('role')}><option value="buyer">Buyer</option><option value="stakeholder">Stakeholder</option></select>
        {RATINGS.map(k => (
          <div key={k}>
            <label style={{ textTransform: 'capitalize' }}>{k} (1–5)</label>
            <input type="number" min="1" max="5" required value={v[k]} onChange={set(k)} />
          </div>
        ))}
        <label>Comments</label>
        <textarea rows="3" value={v.comment} onChange={set('comment')} />
        <div className="row"><button className="pri">Submit feedback</button></div>
        {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}
      </form>
    </details>
  )
}

export default function MapPage() {
  const { user } = useAuth()
  const [sp] = useSearchParams()
  const [lots, setLots] = useState([])
  const [landmarks, setLandmarks] = useState([])
  const [f, setF] = useState(EMPTY)
  const [selId, setSelId] = useState(null)
  const [target, setTarget] = useState(null)
  const [saved, setSaved] = useState(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/api/lots'), api('/api/landmarks')])
      .then(([a, b]) => { setLots(a); setLandmarks(b) })
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    if (user?.role === 'buyer') {
      api('/api/buyer/favorites').then(a => setSaved(new Set(a.map(l => l.id)))).catch(() => {})
    } else setSaved(new Set())
  }, [user])

  const set = k => e => setF({ ...f, [k]: e.target.value })
  const onLandmark = e => {
    const v = e.target.value
    setF({ ...f, lm: v })
    const lm = landmarks.find(l => String(l.id) === v)
    if (lm) setTarget({ center: [lm.lat, lm.lng] })
  }
  const choose = l => { setSelId(l.id); setTarget({ bounds: toLL(l.boundary) }) }

  // open a lot directly, e.g. /map?lot=5 from the buyer dashboard
  useEffect(() => {
    const id = Number(sp.get('lot'))
    if (!id || lots.length === 0) return
    const l = lots.find(x => x.id === id)
    if (l) choose(l)
  }, [lots]) // eslint-disable-line

  async function toggleSave(id) {
    try {
      if (saved.has(id)) {
        await api('/api/buyer/favorites/' + id, { method: 'DELETE' })
        setSaved(s => { const n = new Set(s); n.delete(id); return n })
      } else {
        await api('/api/buyer/favorites/' + id, { method: 'POST' })
        setSaved(s => new Set(s).add(id))
      }
    } catch (e) { setError(e.message) }
  }

  const shown = useMemo(() => {
    const n = v => (v === '' ? null : Number(v))
    const q = f.q.trim().toLowerCase()
    const lm = landmarks.find(l => String(l.id) === f.lm)
    return lots.filter(l =>
      (!f.brgy || l.barangay === f.brgy) &&
      (!f.status || l.status === f.status) &&
      (!f.type || l.land_type === f.type) &&
      (n(f.pmin) === null || l.price >= n(f.pmin)) &&
      (n(f.pmax) === null || l.price <= n(f.pmax)) &&
      (n(f.smin) === null || l.area_sqm >= n(f.smin)) &&
      (n(f.smax) === null || l.area_sqm <= n(f.smax)) &&
      (!q || [l.title, l.address, l.nearest_road, l.landmark].join(' ').toLowerCase().includes(q)) &&
      (!lm || distM({ lat: l.center_lat, lng: l.center_lng }, lm) <= 1000))
  }, [lots, landmarks, f])

  const sel = lots.find(l => l.id === selId)

  return (
    <>
      <Header subtitle="Mamburao, Occidental Mindoro" />
      <div className="layout">
        <aside className="side">
          <label style={{ marginTop: 0 }}>Search road, landmark or keyword</label>
          <input value={f.q} onChange={set('q')} placeholder="e.g. National Highway" />
          <div className="two">
            <div><label>Barangay</label>
              <select value={f.brgy} onChange={set('brgy')}><option value="">All barangays</option>{BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></div>
            <div><label>Near landmark (1 km)</label>
              <select value={f.lm} onChange={onLandmark}><option value="">Any</option>{landmarks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div><label>Min price (₱)</label><input type="number" min="0" value={f.pmin} onChange={set('pmin')} /></div>
            <div><label>Max price (₱)</label><input type="number" min="0" value={f.pmax} onChange={set('pmax')} /></div>
            <div><label>Min size (m²)</label><input type="number" min="0" value={f.smin} onChange={set('smin')} /></div>
            <div><label>Max size (m²)</label><input type="number" min="0" value={f.smax} onChange={set('smax')} /></div>
            <div><label>Land type</label>
              <select value={f.type} onChange={set('type')}><option value="">All types</option>{LAND_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label>Status</label>
              <select value={f.status} onChange={set('status')}><option value="">All statuses</option><option>available</option><option>reserved</option><option>sold</option></select></div>
          </div>
          <div className="row"><button onClick={() => setF(EMPTY)}>Reset filters</button></div>
          {error && <div className="err">{error}</div>}
          <p className="mu">{shown.length} lot(s) found</p>
          {shown.map(l => (
            <div key={l.id} className={'item' + (l.id === selId ? ' sel' : '')} onClick={() => choose(l)}>
              <b>{saved.has(l.id) ? '♥ ' : ''}{l.title}</b>
              <span className="mu">{l.barangay} · {Math.round(l.area_sqm)} m² · {peso(l.price)}</span>{' '}
              <span className={'badge ' + l.status}>{l.status}</span>
            </div>
          ))}
          {sel && (
            <div>
              <hr />
              <h3 style={{ margin: 0 }}>{sel.title}</h3>
              <p className="mu" style={{ margin: '2px 0 8px' }}>{sel.barangay}{sel.address ? ', ' + sel.address : ''}</p>
              {user?.role === 'buyer' && (
                <div className="row" style={{ marginTop: 0, marginBottom: 8 }}>
                  <button className={saved.has(sel.id) ? '' : 'pri'} onClick={() => toggleSave(sel.id)}>
                    {saved.has(sel.id) ? '♥ Saved' : '♡ Save this lot'}
                  </button>
                </div>
              )}
              {!user && <p className="mu"><Link to="/login?role=buyer">Sign in as a buyer</Link> to save this lot.</p>}
              <table><tbody>
                <tr><td>Price</td><td><b>{peso(sel.price)}</b></td></tr>
                <tr><td>Size</td><td>{Math.round(sel.area_sqm)} m²</td></tr>
                <tr><td>Status</td><td><span className={'badge ' + sel.status}>{sel.status}</span></td></tr>
                <tr><td>Land type</td><td>{sel.land_type}</td></tr>
                <tr><td>Nearest road</td><td>{sel.nearest_road || '-'}</td></tr>
                <tr><td>Landmark</td><td>{sel.landmark || '-'}</td></tr>
                <tr><td>Seller</td><td>{sel.seller_name || '-'}</td></tr>
                <tr><td>Contact</td><td>{sel.seller_phone ? <a href={'tel:' + sel.seller_phone}>{sel.seller_phone}</a> : '-'}</td></tr>
              </tbody></table>
              <p className="mu">Boundary sides: {sideLengths(sel.boundary).map(s => s.toFixed(1) + ' m').join(' · ')}</p>
              <p>{sel.description}</p>
              <p className="mu">Boundaries are approximate until confirmed by a licensed geodetic engineer.</p>
            </div>
          )}
          <Feedback />
        </aside>

        <MapContainer className="map" center={MAMBURAO} zoom={14}>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Street">
              <TileLayer maxZoom={19} attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer maxZoom={19} attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </LayersControl.BaseLayer>
          </LayersControl>
          {landmarks.map(l => (
            <CircleMarker key={l.id} center={[l.lat, l.lng]} radius={7}
              pathOptions={{ color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
              <Tooltip>{l.name}</Tooltip>
            </CircleMarker>
          ))}
          {shown.map(l => (
            <Polygon key={l.id} positions={toLL(l.boundary)}
              pathOptions={{ color: COLORS[l.status], fillColor: COLORS[l.status], fillOpacity: 0.45, weight: l.id === selId ? 5 : 2 }}
              eventHandlers={{ click: () => choose(l) }} />
          ))}
          <FlyTo target={target} />
        </MapContainer>
      </div>
    </>
  )
}