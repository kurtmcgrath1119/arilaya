import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MapContainer, TileLayer, LayersControl, Polygon, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { api, peso, toLL, areaSqm, BARANGAYS, LAND_TYPES, MAMBURAO } from '../api'
import { useAuth } from '../useAuth'
import LotPhotos from '../LotPhotos'
import Header from '../Header'
import './seller.css'

const dot = L.divIcon({ className: 'vtx', iconSize: [14, 14] })
const EMPTY = { title: '', barangay: BARANGAYS[0], land_type: 'residential', price: '', status: 'available',
  address: '', nearest_road: '', landmark: '', description: '' }
const APPROVAL = { pending: 'Pending review', approved: 'Live on map', rejected: 'Rejected' }
const MAX_PHOTOS = 6
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
  useMapEvents({ click: event => setPts(current => [...current, { lat: event.latlng.lat, lng: event.latlng.lng }]) })
  return (
    <>
      {pts.length >= 2 && <Polygon positions={toLL(pts)} pathOptions={{ color: '#8dc63f', weight: 3, fillOpacity: 0.35, interactive: false }} />}
      {pts.map((point, index) => (
        <Marker key={index} position={[point.lat, point.lng]} icon={dot} draggable
          eventHandlers={{ dragend: event => { const ll = event.target.getLatLng(); setPts(current => current.map((item, i) => (i === index ? { lat: ll.lat, lng: ll.lng } : item))) } }} />
      ))}
    </>
  )
}

function FitOnce({ pts }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || pts.length < 3) return
    map.fitBounds(toLL(pts), { maxZoom: 19, padding: [40, 40] })
    fitted.current = true
  }, [pts, map])
  return null
}

function LotForm({ lot, profile, onSaved }) {
  const id = useId()
  const [v, setV] = useState(lot ? Object.fromEntries(Object.keys(EMPTY).map(key => [key, lot[key] ?? EMPTY[key]])) : EMPTY)
  const [pts, setPts] = useState(lot ? lot.boundary.map(point => ({ lat: point.lat, lng: point.lng })) : [])
  const [coords, setCoords] = useState({ lat: '', lng: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [photos, setPhotos] = useState(lot?.photos || [])
  const [removedIds, setRemovedIds] = useState([])
  const [previews, setPreviews] = useState([])
  const previewUrls = useRef([])
  const set = key => event => setV({ ...v, [key]: event.target.value })
  const area = pts.length >= 3 ? areaSqm(pts) : 0
  const activePhotos = photos.filter(photo => !removedIds.includes(photo.id))
  const photoSlots = MAX_PHOTOS - activePhotos.length - previews.length

  useEffect(() => () => previewUrls.current.forEach(url => URL.revokeObjectURL(url)), [])

  function choosePhotos(event) {
    const selected = Array.from(event.target.files || [])
    const invalid = selected.find(file => !PHOTO_TYPES.includes(file.type) || file.size > 8 * 1024 * 1024)
    if (invalid) return setErr('Choose JPG, PNG, or WebP photos that are 8 MB or smaller.')
    const accepted = selected.slice(0, Math.max(0, photoSlots)).map(file => ({ file, url: URL.createObjectURL(file) }))
    if (selected.length > accepted.length) setErr(`You can add up to ${MAX_PHOTOS} photos per listing.`)
    else setErr('')
    const next = [...previews, ...accepted]
    previewUrls.current = next.map(preview => preview.url)
    setPreviews(next)
    event.target.value = ''
  }

  function removeExisting(photoId) {
    setPhotos(current => current.filter(photo => photo.id !== photoId))
    setRemovedIds(current => [...current, photoId])
  }

  function removePreview(index) {
    URL.revokeObjectURL(previews[index].url)
    const next = previews.filter((_, i) => i !== index)
    previewUrls.current = next.map(preview => preview.url)
    setPreviews(next)
  }

  function addCoordinatePoint() {
    const lat = Number(coords.lat)
    const lng = Number(coords.lng)
    if (coords.lat === '' || coords.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setErr('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).')
      return
    }
    setErr('')
    setPts(current => [...current, { lat, lng }])
    setCoords({ lat: '', lng: '' })
  }

  async function save(event) {
    event.preventDefault()
    setErr('')
    if (pts.length < 3) return setErr('Add at least 3 corners of your lot on the map or by coordinates.')
    setBusy(true)
    try {
      const body = new FormData()
      Object.entries(v).forEach(([key, value]) => body.append(key, value))
      body.append('boundary', JSON.stringify(pts))
      body.append('area_sqm', String(Math.round(area * 10) / 10))
      body.append('center_lat', String(pts.reduce((sum, point) => sum + point.lat, 0) / pts.length))
      body.append('center_lng', String(pts.reduce((sum, point) => sum + point.lng, 0) / pts.length))
      previews.forEach(preview => body.append('photos', preview.file))
      if (removedIds.length) body.append('removePhotos', removedIds.join(','))
      if (lot) await api('/api/seller/lots/' + lot.id, { method: 'PUT', body })
      else await api('/api/seller/lots', { method: 'POST', body })
      onSaved(lot ? 'Listing updated and sent for review.' : 'Listing submitted. You’ll see it on the map once the admin approves it.')
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sd-form" onSubmit={save}>
      <div className="sd-card">
        <h2>{lot ? 'Edit your lot' : 'Post a new lot'}</h2>
        <label htmlFor={`${id}-title`}>Title</label>
        <input id={`${id}-title`} required maxLength={80} value={v.title} onChange={set('title')} placeholder="e.g. Residential lot near the market" />
        <div className="two">
          <div><label htmlFor={`${id}-barangay`}>Barangay</label><select id={`${id}-barangay`} value={v.barangay} onChange={set('barangay')}>{BARANGAYS.map(item => <option key={item}>{item}</option>)}</select></div>
          <div><label htmlFor={`${id}-type`}>Land type</label><select id={`${id}-type`} value={v.land_type} onChange={set('land_type')}>{LAND_TYPES.map(item => <option key={item}>{item}</option>)}</select></div>
          <div><label htmlFor={`${id}-price`}>Price (₱)</label><input id={`${id}-price`} required type="number" min="0" value={v.price} onChange={set('price')} /></div>
          <div><label htmlFor={`${id}-status`}>Status</label><select id={`${id}-status`} value={v.status} onChange={set('status')}><option>available</option><option>reserved</option><option>sold</option></select></div>
        </div>
        <label htmlFor={`${id}-address`}>Street / address</label><input id={`${id}-address`} value={v.address} onChange={set('address')} />
        <div className="two">
          <div><label htmlFor={`${id}-road`}>Nearest road</label><input id={`${id}-road`} value={v.nearest_road} onChange={set('nearest_road')} /></div>
          <div><label htmlFor={`${id}-landmark`}>Nearest landmark</label><input id={`${id}-landmark`} value={v.landmark} onChange={set('landmark')} /></div>
        </div>
        <label htmlFor={`${id}-description`}>Description</label><textarea id={`${id}-description`} rows="3" value={v.description} onChange={set('description')} />
        <div className="sd-photo-editor">
          <h3>Lot photos <span>{activePhotos.length + previews.length}/{MAX_PHOTOS}</span></h3>
          <p className="mu" id={`${id}-photo-help`}>Add clear photos of the lot, access road, and surroundings. JPG, PNG, or WebP, up to 8 MB each.</p>
          {(activePhotos.length > 0 || previews.length > 0) && (
            <div className="sd-photo-grid">
              {activePhotos.map((photo, index) => (
                <div className="sd-photo-thumb" key={photo.id}>
                  <img src={photo.url} alt={`Lot photo ${index + 1}`} width="320" height="240" />
                  <button type="button" onClick={() => removeExisting(photo.id)} aria-label={`Remove lot photo ${index + 1}`}>Remove</button>
                </div>
              ))}
              {previews.map((preview, index) => (
                <div className="sd-photo-thumb new" key={preview.url}>
                  <img src={preview.url} alt={`New lot photo ${activePhotos.length + index + 1}`} width="320" height="240" />
                  <button type="button" onClick={() => removePreview(index)} aria-label={`Remove new photo ${index + 1}`}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <label htmlFor={`${id}-photos`}>Choose photos</label>
          <input id={`${id}-photos`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choosePhotos} aria-describedby={`${id}-photo-help`} />
        </div>
        <p className="mu" style={{ marginBottom: 0 }}>Buyers will contact you at <b>{profile?.phone || 'no number yet'}</b>.</p>
        {profile && !profile.phone && <div className="sd-warn">Add a contact number in the Profile tab so buyers can reach you.</div>}
        {err && <div className="err" role="alert">{err}</div>}
        <div className="row"><button className="pri" disabled={busy}>{busy ? 'Saving…' : lot ? 'Save changes' : 'Submit for review'}</button></div>
      </div>

      <div className="sd-card">
        <h2>Mark your lot on the map</h2>
        <p className="mu" style={{ marginTop: -6 }}>Click each corner of the lot. Drag the yellow dots to adjust, or add points by coordinates.</p>
        <div className="sd-map">
          <MapContainer style={{ height: '100%' }} center={lot ? [lot.center_lat, lot.center_lng] : MAMBURAO} zoom={lot ? 18 : 15}>
            <BaseLayers />
            <DrawLayer pts={pts} setPts={setPts} />
            {lot && <FitOnce pts={pts} />}
          </MapContainer>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button type="button" onClick={() => setPts(current => current.slice(0, -1))}>Undo point</button>
          <button type="button" onClick={() => setPts([])}>Clear</button>
          <span className="mu">{pts.length < 3 ? `${pts.length} point(s), need at least 3` : `${pts.length} points · about ${Math.round(area)} m²`}</span>
        </div>
        <div className="sd-coordinate-entry">
          <div className="two">
            <div><label htmlFor={`${id}-lat`}>Latitude</label><input id={`${id}-lat`} type="number" step="any" min="-90" max="90" value={coords.lat} onChange={event => setCoords({ ...coords, lat: event.target.value })} placeholder="13.2233" /></div>
            <div><label htmlFor={`${id}-lng`}>Longitude</label><input id={`${id}-lng`} type="number" step="any" min="-180" max="180" value={coords.lng} onChange={event => setCoords({ ...coords, lng: event.target.value })} placeholder="120.5960" /></div>
          </div>
          <button type="button" onClick={addCoordinatePoint}>Add point by coordinates</button>
        </div>
      </div>
    </form>
  )
}

function ProfileTab({ profile, setProfile, flash }) {
  const id = useId()
  const [phone, setPhone] = useState(profile?.phone || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(event) {
    event.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const data = await api('/api/seller/profile', { method: 'PATCH', body: { phone } })
      setProfile({ ...profile, phone: data.phone })
      flash('Contact number saved.')
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!profile) return null
  const address = [profile.street, profile.barangay, profile.city, profile.province].filter(Boolean).join(', ')
  return (
    <form className="sd-card sd-profile" onSubmit={save}>
      <h2>Your profile</h2>
      <table><tbody>
        <tr><td>Name</td><td>{profile.name}</td></tr>
        <tr><td>Email</td><td>{profile.email}</td></tr>
        <tr><td>Address</td><td>{address || '-'}</td></tr>
        <tr><td>Member since</td><td>{(profile.created_at || '').slice(0, 10)}</td></tr>
      </tbody></table>
      <label htmlFor={`${id}-phone`}>Contact number (shown to buyers)</label>
      <input id={`${id}-phone`} value={phone} onChange={event => setPhone(event.target.value)} placeholder="09171234567" inputMode="tel" autoComplete="tel" />
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row"><button className="pri" disabled={busy}>{busy ? 'Saving…' : 'Save number'}</button></div>
      <p className="mu">A new number applies to listings you create or edit from now on.</p>
    </form>
  )
}

export default function Seller() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState('overview')
  const [lots, setLots] = useState([])
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [dataLoading, setDataLoading] = useState(true)

  const fetchData = useCallback(() => Promise.all([api('/api/seller/lots'), api('/api/seller/profile')]), [])

  useEffect(() => {
    if (user?.role !== 'seller') return
    let active = true
    fetchData()
      .then(([lotData, profileData]) => { if (active) { setLots(lotData); setProfile(profileData) } })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setDataLoading(false) })
    return () => { active = false }
  }, [user, fetchData])

  const load = () => {
    setDataLoading(true)
    setError('')
    fetchData()
      .then(([lotData, profileData]) => { setLots(lotData); setProfile(profileData) })
      .catch(err => setError(err.message))
      .finally(() => setDataLoading(false))
  }
  const flash = text => setToast(text)

  if (loading) return <div className="sd-page-status" role="status">Loading your dashboard…</div>
  if (!user || user.role !== 'seller') return <Navigate to="/login?role=seller" replace />

  const pending = lots.filter(lot => lot.approval === 'pending').length
  const liveAvailable = lots.filter(lot => lot.approval === 'approved' && lot.status === 'available').length
  const startNew = () => { setEditing(null); setTab('post') }
  const edit = lot => { setEditing(lot); setTab('post') }
  const saved = message => { flash(message); load(); setEditing(null); setTab('listings') }

  const changeStatus = async (lot, status) => {
    try {
      await api(`/api/seller/lots/${lot.id}/status`, { method: 'PATCH', body: { status } })
      flash('Status updated.')
      load()
    } catch (err) {
      flash(err.message)
    }
  }
  const remove = async lot => {
    if (!confirm(`Delete “${lot.title}”? This cannot be undone.`)) return
    try {
      await api('/api/seller/lots/' + lot.id, { method: 'DELETE' })
      flash('Listing deleted.')
      load()
    } catch (err) {
      flash(err.message)
    }
  }

  const steps = [
    ['Create your account', true],
    ['Add a contact number', !!profile?.phone],
    ['Post your first lot', lots.length > 0],
    ['Get approved and go live', lots.some(lot => lot.approval === 'approved')]
  ]

  return (
    <>
      <Header subtitle="Seller" />
      <main className="sd" id="main-content" tabIndex={-1}>
        <section className="sd-hero">
          <div><span className="sd-eyebrow">Seller dashboard</span><h1>Welcome, {user.name.split(' ')[0]}</h1><p>Post your lot, keep its status up to date, and let buyers around Mamburao find it on the map.</p></div>
          <button className="sd-cta" onClick={startNew}>+ Post a new lot</button>
        </section>

        <div className="sd-stats">
          <div className="sd-stat" style={{ '--c': '#1b3a2f' }}><b>{lots.length}</b><span>Total listings</span></div>
          <div className="sd-stat" style={{ '--c': '#8dc63f' }}><b>{liveAvailable}</b><span>Approved & available</span></div>
          <div className="sd-stat" style={{ '--c': '#888780' }}><b>{lots.filter(lot => lot.status === 'sold').length}</b><span>Sold</span></div>
          <div className="sd-stat" style={{ '--c': '#ba7517' }}><b>{pending}</b><span>Pending review</span></div>
        </div>

        <div className="sd-tabs" role="group" aria-label="Seller dashboard sections">
          <button className={tab === 'overview' ? 'on' : ''} aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'post' ? 'on' : ''} aria-pressed={tab === 'post'} onClick={startNew}>{editing ? 'Edit lot' : 'Post a lot'}</button>
          <button className={tab === 'listings' ? 'on' : ''} aria-pressed={tab === 'listings'} onClick={() => setTab('listings')}>My listings ({lots.length})</button>
          <button className={tab === 'profile' ? 'on' : ''} aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>Profile</button>
        </div>

        {toast && <div className="sd-toast" role="status">{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification">×</button></div>}
        {error && <div className="sd-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
        {dataLoading && <div className="sd-page-status" role="status">Loading your listings…</div>}

        {!dataLoading && tab === 'overview' && (
          <div className="sd-grid2">
            <div className="sd-card"><h2>Getting started</h2><ul className="sd-check">{steps.map(([title, done]) => <li key={title} className={done ? 'done' : ''}><span className="sd-tick">{done ? '✓' : ''}</span><span>{title}</span></li>)}</ul></div>
            <div className="sd-card"><h2>Tips for a good listing</h2><p className="mu">Mark the lot’s corners carefully, because the size comes from the boundary you draw.</p><p className="mu">Set the status to <b>reserved</b> or <b>sold</b> as soon as it changes, so buyers don’t waste time.</p><p className="mu">New and edited listings are reviewed by the admin before they appear to buyers.</p></div>
          </div>
        )}

        {tab === 'post' && <LotForm key={editing?.id ?? 'new'} lot={editing} profile={profile} onSaved={saved} />}

        {!dataLoading && tab === 'listings' && (
          <div className="sd-card">
            <div className="sd-section-head"><div><h2>My listings</h2><p className="mu">Approval and availability are tracked separately.</p></div><button type="button" className="pri" onClick={startNew}>Post a lot</button></div>
            {lots.length === 0 && <div className="sd-empty">You haven’t posted a lot yet.<div className="row" style={{ justifyContent: 'center' }}><button className="pri" onClick={startNew}>Post your first lot</button></div></div>}
            {lots.map(lot => (
              <article className="sd-lot" key={lot.id}>
                <LotPhotos lot={lot} className="lot-photo-compact" />
                <div className="sd-lot-copy"><h3>{lot.title}</h3><span className="mu">{lot.barangay} · {Math.round(lot.area_sqm)} m² · {peso(lot.price)} · {lot.land_type}</span><br /><span className={'badge ' + lot.approval}>{APPROVAL[lot.approval] || lot.approval}</span>{' '}<span className={'badge ' + lot.status}>{lot.status}</span></div>
                <div className="sd-lot-actions">
                  <select value={lot.status} onChange={event => changeStatus(lot, event.target.value)} aria-label={`Change status for ${lot.title}`}><option>available</option><option>reserved</option><option>sold</option></select>
                  <button onClick={() => edit(lot)}>Edit</button><button className="del" onClick={() => remove(lot)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!dataLoading && tab === 'profile' && <ProfileTab profile={profile} setProfile={setProfile} flash={flash} />}
      </main>
    </>
  )
}
