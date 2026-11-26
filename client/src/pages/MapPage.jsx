import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, LayersControl, Polygon, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { api, peso, toLL, distM, sideLengths, BARANGAYS, LAND_TYPES, MAMBURAO } from '../api'
import { useAuth } from '../useAuth'
import LotPhotos from '../LotPhotos'
import Header from '../Header'
import './map.css'

const COLORS = { available: '#6fb11f', reserved: '#ba7517', sold: '#888780' }
const FILTER_KEYS = ['q', 'brgy', 'lm', 'pmin', 'pmax', 'smin', 'smax', 'type', 'status']
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
  const [busy, setBusy] = useState(false)
  const id = useId()
  const set = key => event => setV({ ...v, [key]: event.target.value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const body = { role: v.role, comment: v.comment, ...Object.fromEntries(RATINGS.map(key => [key, Number(v[key])])) }
      await api('/api/feedback', { method: 'POST', body })
      setMsg({ ok: true, text: 'Thank you for your feedback.' })
      setV(START)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="map-feedback">
      <summary>Rate this system</summary>
      <form onSubmit={submit}>
        <label htmlFor={`${id}-role`}>I am a</label>
        <select id={`${id}-role`} value={v.role} onChange={set('role')}>
          <option value="buyer">Buyer</option><option value="seller">Seller</option><option value="stakeholder">Stakeholder</option>
        </select>
        {RATINGS.map(key => (
          <div key={key}>
            <label htmlFor={`${id}-${key}`} style={{ textTransform: 'capitalize' }}>{key} (1–5)</label>
            <input id={`${id}-${key}`} type="number" min="1" max="5" required value={v[key]} onChange={set(key)} />
          </div>
        ))}
        <label htmlFor={`${id}-comment`}>Comments</label>
        <textarea id={`${id}-comment`} rows="3" value={v.comment} onChange={set('comment')} />
        <div className="row"><button className="pri" disabled={busy}>{busy ? 'Submitting…' : 'Submit feedback'}</button></div>
        {msg && <div className={msg.ok ? 'ok' : 'err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
      </form>
    </details>
  )
}

export default function MapPage() {
  const { user } = useAuth()
  const [sp, setSearchParams] = useSearchParams()
  const [lots, setLots] = useState([])
  const [landmarks, setLandmarks] = useState([])
  const [saved, setSaved] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [mobileView, setMobileView] = useState('list')

  const fetchData = useCallback(() => Promise.all([api('/api/lots'), api('/api/landmarks')]), [])

  useEffect(() => {
    let active = true
    fetchData()
      .then(([lotData, landmarkData]) => { if (active) { setLots(lotData); setLandmarks(landmarkData) } })
      .catch(err => { if (active) setLoadError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchData])

  const loadData = () => {
    setLoading(true)
    setLoadError('')
    fetchData()
      .then(([lotData, landmarkData]) => { setLots(lotData); setLandmarks(landmarkData) })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user?.role !== 'buyer') return
    let active = true
    api('/api/buyer/favorites')
      .then(data => { if (active) setSaved(new Set(data.map(lot => lot.id))) })
      .catch(() => {})
    return () => { active = false }
  }, [user])

  const f = useMemo(() => Object.fromEntries(FILTER_KEYS.map(key => [key, sp.get(key) || ''])), [sp])
  const sort = sp.get('sort') || 'newest'
  const selectedId = Number(sp.get('lot')) || null
  const lm = landmarks.find(item => String(item.id) === f.lm)

  const updateParams = (changes, replace = true) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      Object.entries(changes).forEach(([key, value]) => {
        if (value === '' || value === null || value === undefined) next.delete(key)
        else next.set(key, String(value))
      })
      return next
    }, { replace })
  }

  const set = key => event => updateParams({ [key]: event.target.value, lot: null })
  const onLandmark = event => updateParams({ lm: event.target.value, lot: null })
  const choose = (lot, revealList = false) => {
    updateParams({ lot: lot.id }, false)
    if (revealList) setMobileView('list')
  }
  const viewOnMap = lot => {
    updateParams({ lot: lot.id }, false)
    setMobileView('map')
    if (!window.matchMedia('(max-width: 900px)').matches) return
    document.querySelector('.map')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    })
  }
  const resetFilters = () => setSearchParams({}, { replace: true })

  async function toggleSave(id) {
    setActionError('')
    try {
      if (saved.has(id)) {
        await api('/api/buyer/favorites/' + id, { method: 'DELETE' })
        setSaved(current => { const next = new Set(current); next.delete(id); return next })
        setActionMessage('Removed from saved lots.')
      } else {
        await api('/api/buyer/favorites/' + id, { method: 'POST' })
        setSaved(current => new Set(current).add(id))
        setActionMessage('Lot saved to your dashboard.')
      }
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function shareLot(lot) {
    setActionError('')
    try {
      const url = window.location.href
      if (navigator.share) await navigator.share({ title: lot.title + ' | AriLaya', url })
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setActionMessage('Lot link copied.')
      } else setActionError('Copy the lot link from your browser address bar.')
    } catch (err) {
      if (err.name !== 'AbortError') setActionError('Could not share this link. Copy it from the browser address bar.')
    }
  }

  const shown = useMemo(() => {
    const number = value => value === '' ? null : Number(value)
    const query = f.q.trim().toLowerCase()
    const results = lots.filter(lot =>
      (!f.brgy || lot.barangay === f.brgy) &&
      (!f.status || lot.status === f.status) &&
      (!f.type || lot.land_type === f.type) &&
      (number(f.pmin) === null || lot.price >= number(f.pmin)) &&
      (number(f.pmax) === null || lot.price <= number(f.pmax)) &&
      (number(f.smin) === null || lot.area_sqm >= number(f.smin)) &&
      (number(f.smax) === null || lot.area_sqm <= number(f.smax)) &&
      (!query || [lot.title, lot.address, lot.nearest_road, lot.landmark].join(' ').toLowerCase().includes(query)) &&
      (!lm || distM({ lat: lot.center_lat, lng: lot.center_lng }, lm) <= 1000)
    )
    return results.sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price
      if (sort === 'price-desc') return b.price - a.price
      if (sort === 'size-desc') return b.area_sqm - a.area_sqm
      if (sort === 'distance' && lm) return distM({ lat: a.center_lat, lng: a.center_lng }, lm) - distM({ lat: b.center_lat, lng: b.center_lng }, lm)
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    })
  }, [lots, f, lm, sort])

  const sel = shown.find(lot => lot.id === selectedId)
  const target = useMemo(() => {
    if (sel) return { bounds: toLL(sel.boundary) }
    if (lm) return { center: [lm.lat, lm.lng] }
    return null
  }, [sel, lm])

  const activeFilters = [
    f.q && ['q', `“${f.q}”`],
    f.brgy && ['brgy', f.brgy],
    f.lm && ['lm', landmarks.find(item => String(item.id) === f.lm)?.name || 'Selected landmark'],
    f.pmin && ['pmin', `From ${peso(f.pmin)}`],
    f.pmax && ['pmax', `Up to ${peso(f.pmax)}`],
    f.smin && ['smin', `At least ${Number(f.smin).toLocaleString()} m²`],
    f.smax && ['smax', `Up to ${Number(f.smax).toLocaleString()} m²`],
    f.type && ['type', f.type],
    f.status && ['status', f.status]
  ].filter(Boolean)

  return (
    <>
      <Header subtitle="Mamburao, Occidental Mindoro" />
      <main className="map-page" id="main-content" tabIndex={-1} data-view={mobileView}>
        <div className="map-toolbar">
          <div><span className="map-toolbar-label">Explore Mamburao</span><strong>{loading ? 'Loading lots…' : `${shown.length} ${shown.length === 1 ? 'lot' : 'lots'} found`}</strong></div>
          <div className="map-view-switch" role="group" aria-label="Choose map or list view">
            <button type="button" className={mobileView === 'list' ? 'on' : ''} aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}>List</button>
            <button type="button" className={mobileView === 'map' ? 'on' : ''} aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}>Map</button>
          </div>
        </div>

        <div className="layout">
          <aside className="side" aria-label="Lot search and details">
            <div className="map-search-head"><h1>Find your next lot</h1><p>Search, filter, and compare mapped listings.</p></div>
            <label htmlFor="map-search">Search road, landmark, or keyword</label>
            <input id="map-search" value={f.q} onChange={set('q')} placeholder="e.g. National Highway" />
            <div className="two">
              <div><label htmlFor="map-barangay">Barangay</label>
                <select id="map-barangay" value={f.brgy} onChange={set('brgy')}><option value="">All barangays</option>{BARANGAYS.map(item => <option key={item}>{item}</option>)}</select></div>
              <div><label htmlFor="map-landmark">Near landmark (1 km)</label>
                <select id="map-landmark" value={f.lm} onChange={onLandmark}><option value="">Any</option>{landmarks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><label htmlFor="map-min-price">Min price (₱)</label><input id="map-min-price" type="number" min="0" value={f.pmin} onChange={set('pmin')} /></div>
              <div><label htmlFor="map-max-price">Max price (₱)</label><input id="map-max-price" type="number" min="0" value={f.pmax} onChange={set('pmax')} /></div>
              <div><label htmlFor="map-min-size">Min size (m²)</label><input id="map-min-size" type="number" min="0" value={f.smin} onChange={set('smin')} /></div>
              <div><label htmlFor="map-max-size">Max size (m²)</label><input id="map-max-size" type="number" min="0" value={f.smax} onChange={set('smax')} /></div>
              <div><label htmlFor="map-type">Land type</label>
                <select id="map-type" value={f.type} onChange={set('type')}><option value="">All types</option>{LAND_TYPES.map(item => <option key={item}>{item}</option>)}</select></div>
              <div><label htmlFor="map-status">Status</label>
                <select id="map-status" value={f.status} onChange={set('status')}><option value="">All statuses</option><option>available</option><option>reserved</option><option>sold</option></select></div>
            </div>
            <div className="two map-sort-row">
              <div><label htmlFor="map-sort">Sort results</label>
                <select id="map-sort" value={sort} onChange={event => updateParams({ sort: event.target.value || null })}>
                  <option value="newest">Newest updated</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="size-desc">Largest area</option>{lm && <option value="distance">Nearest landmark</option>}
                </select></div>
              <div className="map-reset"><button type="button" onClick={resetFilters}>Reset filters</button></div>
            </div>

            {activeFilters.length > 0 && (
              <div className="map-active-filters" aria-label="Active filters">
                {activeFilters.map(([key, label]) => <button type="button" key={key} onClick={() => updateParams({ [key]: null })} aria-label={`Remove ${label} filter`}>{label}<span aria-hidden="true">×</span></button>)}
              </div>
            )}
            {loadError && <div className="err" role="alert">{loadError} <button type="button" onClick={loadData}>Try again</button></div>}
            {actionError && <div className="err" role="alert">{actionError}</div>}
            {actionMessage && <div className="ok" role="status">{actionMessage}</div>}

            {loading && <div className="map-loading" role="status">Loading mapped lots…</div>}
            {!loading && !loadError && shown.length === 0 && (
              <div className="map-empty"><h2>No lots match these filters</h2><p>Try a wider price range, another barangay, or clear the filters.</p><button type="button" className="pri" onClick={resetFilters}>Clear all filters</button></div>
            )}
            {!loading && shown.map(lot => {
              const distance = lm ? distM({ lat: lot.center_lat, lng: lot.center_lng }, lm) : null
              return (
                <article key={lot.id} className={'item' + (lot.id === selectedId ? ' sel' : '')}>
                  <LotPhotos lot={lot} onViewMap={viewOnMap} />
                  <button type="button" className="item-main" onClick={() => choose(lot)} aria-pressed={lot.id === selectedId}>
                    <b>{lot.title}</b>
                    <span className="mu">{lot.barangay} · {Math.round(lot.area_sqm).toLocaleString()} m² · {peso(lot.price)}</span>{' '}
                    <span className={'badge ' + lot.status}>{lot.status}</span>
                    <span className="map-card-meta">{lot.land_type}{distance !== null ? ` · ${distance < 1000 ? Math.round(distance) + ' m' : (distance / 1000).toFixed(1) + ' km'} from ${lm.name}` : ''}{lot.area_sqm ? ` · ${peso(Math.round(lot.price / lot.area_sqm))}/m²` : ''}</span>
                  </button>
                </article>
              )
            })}

            {sel && (
              <section className="map-detail" aria-labelledby="selected-lot-title">
                <div className="map-detail-head"><div><span className="mu">Selected lot</span><h2 id="selected-lot-title">{sel.title}</h2></div><button type="button" className="map-close-selection" onClick={() => updateParams({ lot: null })} aria-label="Clear selected lot">×</button></div>
                <p className="mu">{sel.barangay}{sel.address ? ', ' + sel.address : ''}</p>
                <div className="map-detail-actions">
                  {user?.role === 'buyer' && <button className={saved.has(sel.id) ? '' : 'pri'} onClick={() => toggleSave(sel.id)}>{saved.has(sel.id) ? '♥ Saved' : '♡ Save lot'}</button>}
                  <button type="button" onClick={() => shareLot(sel)}>Share lot</button>
                  {sel.seller_phone && <a className="map-contact" href={'tel:' + sel.seller_phone}>Call seller</a>}
                </div>
                {!user && <p className="mu"><Link to="/login?role=buyer">Sign in as a buyer</Link> to save this lot.</p>}
                <table><tbody>
                  <tr><td>Price</td><td><b>{peso(sel.price)}</b></td></tr>
                  <tr><td>Price per m²</td><td>{sel.area_sqm ? peso(Math.round(sel.price / sel.area_sqm)) : '-'}</td></tr>
                  <tr><td>Size</td><td>{Math.round(sel.area_sqm).toLocaleString()} m²</td></tr>
                  <tr><td>Status</td><td><span className={'badge ' + sel.status}>{sel.status}</span></td></tr>
                  <tr><td>Land type</td><td>{sel.land_type}</td></tr>
                  <tr><td>Nearest road</td><td>{sel.nearest_road || '-'}</td></tr>
                  <tr><td>Landmark</td><td>{sel.landmark || '-'}</td></tr>
                  <tr><td>Seller</td><td>{sel.seller_name || '-'}</td></tr>
                  <tr><td>Contact</td><td>{sel.seller_phone ? <a href={'tel:' + sel.seller_phone}>{sel.seller_phone}</a> : '-'}</td></tr>
                </tbody></table>
                <p className="mu">Boundary sides: {sideLengths(sel.boundary).map(value => value.toFixed(1) + ' m').join(' · ')}</p>
                <p>{sel.description}</p>
                <p className="mu">Boundaries are approximate until confirmed by a licensed geodetic engineer.</p>
              </section>
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
            {landmarks.map(item => (
              <CircleMarker key={item.id} center={[item.lat, item.lng]} radius={7}
                pathOptions={{ color: '#10241b', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
                <Tooltip>{item.name}{item.category ? ` · ${item.category}` : ''}</Tooltip>
              </CircleMarker>
            ))}
            {shown.map(lot => (
              <Polygon key={lot.id} positions={toLL(lot.boundary)}
                pathOptions={{ color: COLORS[lot.status], fillColor: COLORS[lot.status], fillOpacity: 0.45, weight: lot.id === selectedId ? 5 : 2 }}
                eventHandlers={{ click: () => choose(lot, true) }}>
                <Tooltip sticky>{lot.title} · {peso(lot.price)}</Tooltip>
              </Polygon>
            ))}
            <FlyTo target={target} />
          </MapContainer>
        </div>
      </main>
    </>
  )
}
