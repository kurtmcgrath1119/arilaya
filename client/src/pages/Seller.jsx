import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MapContainer, TileLayer, LayersControl, Polygon, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { api, peso, toLL, areaSqm, BARANGAYS, LAND_TYPES, MAMBURAO } from '../api'
import { useAuth } from '../AuthContext'
import Header from '../Header'
import './seller.css'

const dot = L.divIcon({ className: 'vtx', iconSize: [14, 14] })
const EMPTY = { title: '', barangay: BARANGAYS[0], land_type: 'residential', price: '', status: 'available',
  address: '', nearest_road: '', landmark: '', description: '' }
const APPROVAL = { pending: 'Pending review', approved: 'Live on map', rejected: 'Rejected' }

function BaseLayers() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Street">
        <TileLayer maxZoom={19} attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite">
        <TileLayer maxZoom={19} attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      </LayersControl.BaseLayer>
    </LayersControl>
  )
}

function DrawLayer({ pts, setPts }) {
  useMapEvents({ click: e => setPts(p => [...p, { lat: e.latlng.lat, lng: e.latlng.lng }]) })
  return (
    <>
      {pts.length >= 2 && <Polygon positions={toLL(pts)} pathOptions={{ color: '#8dc63f', weight: 3, fillOpacity: 0.35, interactive: false }} />}
      {pts.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={dot} draggable
          eventHandlers={{ dragend: e => { const ll = e.target.getLatLng(); setPts(a => a.map((q, j) => (j === i ? { lat: ll.lat, lng: ll.lng } : q))) } }} />
      ))}
    </>
  )
}

function FitOnce({ pts }) {
  const map = useMap()
  useEffect(() => { if (pts.length >= 3) map.fitBounds(toLL(pts), { maxZoom: 19, padding: [40, 40] }) }, []) // eslint-disable-line
  return null
}

function LotForm({ lot, profile, onSaved }) {
  const [v, setV] = useState(lot ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, lot[k] ?? EMPTY[k]])) : EMPTY)
  const [pts, setPts] = useState(lot ? lot.boundary.map(p => ({ lat: p.lat, lng: p.lng })) : [])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = k => e => setV({ ...v, [k]: e.target.value })
  const area = pts.length >= 3 ? areaSqm(pts) : 0

  async function save(e) {
    e.preventDefault(); setErr('')
    if (pts.length < 3) return setErr('Click the map to mark at least 3 corners of your lot.')
    setBusy(true)
    try {
      const body = {
        ...v, price: Number(v.price), boundary: pts,
        area_sqm: Math.round(area * 10) / 10,
        center_lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
        center_lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length
      }
      lot ? await api('/api/seller/lots/' + lot.id, { method: 'PUT', body }) : await api('/api/seller/lots', { method: 'POST', body })
      onSaved(lot ? 'Listing updated and sent for review.' : 'Listing submitted. You’ll see it on the map once the admin approves it.')
    } catch (er) { setErr(er.message) }
    setBusy(false)
  }

  return (
    <form className="sd-form" onSubmit={save}>
      <div className="sd-card">
        <h3>{lot ? 'Edit your lot' : 'Post a new lot'}</h3>
        <label style={{ marginTop: 0 }}>Title</label>
        <input required maxLength={80} value={v.title} onChange={set('title')} placeholder="e.g. Residential lot near the market" />
        <div className="two">
          <div><label>Barangay</label><select value={v.barangay} onChange={set('barangay')}>{BARANGAYS.map(b => <option key={b}>{b}</option>)}</select></div>
          <div><label>Land type</label><select value={v.land_type} onChange={set('land_type')}>{LAND_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Price (₱)</label><input required type="number" min="0" value={v.price} onChange={set('price')} /></div>
          <div><label>Status</label><select value={v.status} onChange={set('status')}><option>available</option><option>reserved</option><option>sold</option></select></div>
        </div>
        <label>Street / address</label><input value={v.address} onChange={set('address')} />
        <div className="two">
          <div><label>Nearest road</label><input value={v.nearest_road} onChange={set('nearest_road')} /></div>
          <div><label>Nearest landmark</label><input value={v.landmark} onChange={set('landmark')} /></div>
        </div>
        <label>Description</label><textarea rows="3" value={v.description} onChange={set('description')} />
        <p className="mu" style={{ marginBottom: 0 }}>
          Buyers will contact you at <b>{profile?.phone || 'no number yet'}</b>.
        </p>
        {profile && !profile.phone && <div className="sd-warn">Add a contact number in the Profile tab so buyers can reach you.</div>}
        {err && <div className="err">{err}</div>}
        <div className="row"><button className="pri" disabled={busy}>{busy ? 'Saving…' : lot ? 'Save changes' : 'Submit for review'}</button></div>
      </div>

      <div className="sd-card">
        <h3>Mark your lot on the map</h3>
        <p className="mu" style={{ marginTop: -6 }}>Click each corner of the lot. Drag the yellow dots to adjust.</p>
        <div className="sd-map">
          <MapContainer style={{ height: '100%' }} center={lot ? [lot.center_lat, lot.center_lng] : MAMBURAO} zoom={lot ? 18 : 15}>
            <BaseLayers />
            <DrawLayer pts={pts} setPts={setPts} />
            {lot && <FitOnce pts={pts} />}
          </MapContainer>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button type="button" onClick={() => setPts(p => p.slice(0, -1))}>Undo point</button>
          <button type="button" onClick={() => setPts([])}>Clear</button>
          <span className="mu">{pts.length < 3 ? `${pts.length} point(s), need at least 3` : `${pts.length} points · about ${Math.round(area)} m²`}</span>
        </div>
      </div>
    </form>
  )
}

function ProfileTab({ profile, setProfile, flash }) {
  const [phone, setPhone] = useState(profile?.phone || '')
  const [err, setErr] = useState('')
  async function save() {
    setErr('')
    try { const d = await api('/api/seller/profile', { method: 'PATCH', body: { phone } }); setProfile({ ...profile, phone: d.phone }); flash('Contact number saved.') }
    catch (e) { setErr(e.message) }
  }
  if (!profile) return null
  const addr = [profile.street, profile.barangay, profile.city, profile.province].filter(Boolean).join(', ')
  return (
    <div className="sd-card" style={{ maxWidth: 560 }}>
      <h3>Your profile</h3>
      <table><tbody>
        <tr><td>Name</td><td>{profile.name}</td></tr>
        <tr><td>Email</td><td>{profile.email}</td></tr>
        <tr><td>Address</td><td>{addr || '-'}</td></tr>
        <tr><td>Member since</td><td>{(profile.created_at || '').slice(0, 10)}</td></tr>
      </tbody></table>
      <label>Contact number (shown to buyers)</label>
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09171234567" inputMode="tel" />
      {err && <div className="err">{err}</div>}
      <div className="row"><button className="pri" onClick={save}>Save number</button></div>
      <p className="mu">A new number applies to listings you create or edit from now on.</p>
    </div>
  )
}

export default function Seller() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState('overview')
  const [lots, setLots] = useState([])
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')

  const reload = () => api('/api/seller/lots').then(setLots).catch(() => {})
  const flash = t => { setToast(t); setTimeout(() => setToast(''), 4000) }

  useEffect(() => {
    if (user?.role === 'seller') { reload(); api('/api/seller/profile').then(setProfile).catch(() => {}) }
  }, [user])

  if (loading) return null
  if (!user || user.role !== 'seller') return <Navigate to="/login?role=seller" replace />

  const count = s => lots.filter(l => l.status === s).length
  const pending = lots.filter(l => l.approval === 'pending').length
  const startNew = () => { setEditing(null); setTab('post') }
  const edit = l => { setEditing(l); setTab('post') }
  const saved = msg => { flash(msg); reload(); setEditing(null); setTab('listings') }

  const changeStatus = async (l, status) => {
    try { await api(`/api/seller/lots/${l.id}/status`, { method: 'PATCH', body: { status } }); flash('Status updated.'); reload() }
    catch (e) { flash(e.message) }
  }
  const remove = async l => {
    if (!confirm(`Delete “${l.title}”? This cannot be undone.`)) return
    await api('/api/seller/lots/' + l.id, { method: 'DELETE' }); flash('Listing deleted.'); reload()
  }

  const steps = [
    ['Create your account', true],
    ['Add a contact number', !!profile?.phone],
    ['Post your first lot', lots.length > 0],
    ['Get approved and go live', lots.some(l => l.approval === 'approved')]
  ]

  return (
    <>
      <Header subtitle="Seller" />
      <main className="sd">
        <section className="sd-hero">
          <div>
            <span className="sd-eyebrow">Seller dashboard</span>
            <h2>Welcome, {user.name.split(' ')[0]}</h2>
            <p>Post your lot, keep its status up to date, and let buyers around Mamburao find it on the map.</p>
          </div>
          <button className="sd-cta" onClick={startNew}>+ Post a new lot</button>
        </section>

        <div className="sd-stats">
          <div className="sd-stat" style={{ '--c': '#1b3a2f' }}><b>{lots.length}</b><span>Total listings</span></div>
          <div className="sd-stat" style={{ '--c': '#8dc63f' }}><b>{count('available')}</b><span>Available</span></div>
          <div className="sd-stat" style={{ '--c': '#888780' }}><b>{count('sold')}</b><span>Sold</span></div>
          <div className="sd-stat" style={{ '--c': '#ba7517' }}><b>{pending}</b><span>Pending review</span></div>
        </div>

        <div className="sd-tabs">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'post' ? 'on' : ''} onClick={startNew}>{editing ? 'Edit lot' : 'Post a lot'}</button>
          <button className={tab === 'listings' ? 'on' : ''} onClick={() => setTab('listings')}>My listings ({lots.length})</button>
          <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Profile</button>
        </div>

        {toast && <div className="sd-toast">{toast}</div>}

        {tab === 'overview' && (
          <div className="sd-grid2">
            <div className="sd-card">
              <h3>Getting started</h3>
              <ul className="sd-check">
                {steps.map(([t, done]) => (
                  <li key={t} className={done ? 'done' : ''}><span className="sd-tick">{done ? '✓' : ''}</span><span>{t}</span></li>
                ))}
              </ul>
            </div>
            <div className="sd-card">
              <h3>Tips for a good listing</h3>
              <p className="mu">Mark the lot’s corners carefully, because the size comes from the boundary you draw.</p>
              <p className="mu">Set the status to <b>reserved</b> or <b>sold</b> as soon as it changes, so buyers don’t waste time.</p>
              <p className="mu">New and edited listings are reviewed by the admin before they appear to buyers.</p>
            </div>
          </div>
        )}

        {tab === 'post' && <LotForm key={editing?.id ?? 'new'} lot={editing} profile={profile} onSaved={saved} />}

        {tab === 'listings' && (
          <div className="sd-card">
            <h3>My listings</h3>
            {lots.length === 0 && (
              <div className="sd-empty">You haven’t posted a lot yet.<div className="row" style={{ justifyContent: 'center' }}><button className="pri" onClick={startNew}>Post your first lot</button></div></div>
            )}
            {lots.map(l => (
              <div className="sd-lot" key={l.id}>
                <div>
                  <b>{l.title}</b>
                  <span className="mu">{l.barangay} · {Math.round(l.area_sqm)} m² · {peso(l.price)} · {l.land_type}</span><br />
                  <span className={'badge ' + l.approval}>{APPROVAL[l.approval] || l.approval}</span>{' '}
                  <span className={'badge ' + l.status}>{l.status}</span>
                </div>
                <div className="sd-lot-actions">
                  <select value={l.status} onChange={e => changeStatus(l, e.target.value)} aria-label="Change status">
                    <option>available</option><option>reserved</option><option>sold</option>
                  </select>
                  <button onClick={() => edit(l)}>Edit</button>
                  <button className="del" onClick={() => remove(l)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'profile' && <ProfileTab profile={profile} setProfile={setProfile} flash={flash} />}
      </main>
    </>
  )
}