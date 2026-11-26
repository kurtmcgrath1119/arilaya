import { useCallback, useEffect, useId, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api, peso } from '../api'
import { useAuth } from '../useAuth'
import LotPhotos from '../LotPhotos'
import Header from '../Header'
import './seller.css'

function ProfileTab({ profile, setProfile, flash }) {
  const id = useId()
  const [v, setV] = useState({
    phone: profile.phone || '', street: profile.street || '', barangay: profile.barangay || '',
    city: profile.city || '', province: profile.province || ''
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = key => event => setV({ ...v, [key]: event.target.value })

  async function save(event) {
    event.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await api('/api/buyer/profile', { method: 'PATCH', body: v })
      setProfile({ ...profile, ...v })
      flash('Profile saved.')
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sd-card sd-profile" onSubmit={save}>
      <h3>Your profile</h3>
      <table><tbody>
        <tr><td>Name</td><td>{profile.name}</td></tr>
        <tr><td>Email</td><td>{profile.email}</td></tr>
        <tr><td>Member since</td><td>{(profile.created_at || '').slice(0, 10)}</td></tr>
      </tbody></table>
      <label htmlFor={`${id}-phone`}>Contact number</label>
      <input id={`${id}-phone`} value={v.phone} onChange={set('phone')} placeholder="09171234567" inputMode="tel" autoComplete="tel" />
      <label htmlFor={`${id}-street`}>House No. / Street / Purok</label>
      <input id={`${id}-street`} value={v.street} onChange={set('street')} autoComplete="address-line1" />
      <div className="two">
        <div><label htmlFor={`${id}-barangay`}>Barangay</label><input id={`${id}-barangay`} value={v.barangay} onChange={set('barangay')} /></div>
        <div><label htmlFor={`${id}-city`}>City / Municipality</label><input id={`${id}-city`} value={v.city} onChange={set('city')} autoComplete="address-level2" /></div>
      </div>
      <label htmlFor={`${id}-province`}>Province</label>
      <input id={`${id}-province`} value={v.province} onChange={set('province')} autoComplete="address-level1" />
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row"><button className="pri" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  )
}

export default function Buyer() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState('overview')
  const [saved, setSaved] = useState([])
  const [lots, setLots] = useState([])
  const [profile, setProfile] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [dataLoading, setDataLoading] = useState(true)
  const [compareIds, setCompareIds] = useState([])

  const fetchData = useCallback(() => Promise.all([
    api('/api/buyer/favorites'), api('/api/lots'), api('/api/buyer/profile')
  ]), [])

  useEffect(() => {
    if (user?.role !== 'buyer') return
    let active = true
    fetchData()
      .then(([savedData, lotData, profileData]) => { if (active) { setSaved(savedData); setLots(lotData); setProfile(profileData) } })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setDataLoading(false) })
    return () => { active = false }
  }, [user, fetchData])

  const load = () => {
    setDataLoading(true)
    setError('')
    fetchData()
      .then(([savedData, lotData, profileData]) => { setSaved(savedData); setLots(lotData); setProfile(profileData) })
      .catch(err => setError(err.message))
      .finally(() => setDataLoading(false))
  }

  const flash = text => setToast(text)

  if (loading) return <div className="sd-page-status" role="status">Loading your dashboard…</div>
  if (!user || user.role !== 'buyer') return <Navigate to="/login?role=buyer" replace />

  const available = lots.filter(lot => lot.status === 'available')
  const latest = available.slice(0, 3)
  const barangays = new Set(available.map(lot => lot.barangay)).size
  const savedAvailable = saved.filter(lot => lot.status === 'available').length
  const compared = compareIds.map(id => saved.find(lot => lot.id === id)).filter(Boolean)

  async function remove(lot) {
    try {
      await api('/api/buyer/favorites/' + lot.id, { method: 'DELETE' })
      setSaved(current => current.filter(item => item.id !== lot.id))
      setCompareIds(current => current.filter(id => id !== lot.id))
      flash('Removed from saved lots.')
    } catch (err) {
      flash(err.message)
    }
  }

  function toggleCompare(lot) {
    setCompareIds(current => {
      if (current.includes(lot.id)) return current.filter(id => id !== lot.id)
      if (current.length >= 3) {
        flash('You can compare up to three lots at a time.')
        return current
      }
      return [...current, lot.id]
    })
  }

  const steps = [
    ['Create your account', true],
    ['Add your contact number', !!profile?.phone],
    ['Save your first lot', saved.length > 0]
  ]

  return (
    <>
      <Header subtitle="Buyer" />
      <main className="sd" id="main-content" tabIndex={-1}>
        <section className="sd-hero">
          <div>
            <span className="sd-eyebrow">Buyer dashboard</span>
            <h1>Welcome, {user.name.split(' ')[0]}</h1>
            <p>Browse available lots in Mamburao, save the ones you like, and contact sellers when you’re ready.</p>
          </div>
          <Link className="sd-cta" to="/map">Browse the map</Link>
        </section>

        <div className="sd-stats">
          <div className="sd-stat" style={{ '--c': '#1b3a2f' }}><b>{saved.length}</b><span>Saved lots</span></div>
          <div className="sd-stat" style={{ '--c': '#8dc63f' }}><b>{savedAvailable}</b><span>Saved and still available</span></div>
          <div className="sd-stat" style={{ '--c': '#ba7517' }}><b>{available.length}</b><span>Lots available now</span></div>
          <div className="sd-stat" style={{ '--c': '#888780' }}><b>{barangays}</b><span>Barangays with lots</span></div>
        </div>

        <div className="sd-tabs" role="group" aria-label="Buyer dashboard sections">
          <button className={tab === 'overview' ? 'on' : ''} aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'saved' ? 'on' : ''} aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}>Saved lots ({saved.length})</button>
          <button className={tab === 'profile' ? 'on' : ''} aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>Profile</button>
        </div>

        {toast && <div className="sd-toast" role="status">{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification">×</button></div>}
        {error && <div className="sd-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
        {dataLoading && <div className="sd-page-status" role="status">Loading your lots…</div>}

        {!dataLoading && tab === 'overview' && (
          <>
            <div className="sd-grid2">
              <div className="sd-card">
                <h2>Getting started</h2>
                <ul className="sd-check">
                  {steps.map(([title, done]) => <li key={title} className={done ? 'done' : ''}><span className="sd-tick">{done ? '✓' : ''}</span><span>{title}</span></li>)}
                </ul>
              </div>
              <div className="sd-card">
                <h2>Tips for finding a lot</h2>
                <p className="mu">Use the filters on the map to narrow lots by barangay, price, size, land type, and distance from a landmark.</p>
                <p className="mu">Save up to three lots and use the comparison table to review their key details side by side.</p>
                <p className="mu">Boundaries are approximate. Visit the site and confirm the lot with the seller and a licensed geodetic engineer before deciding.</p>
              </div>
            </div>

            <div className="sd-card sd-full">
              <h2>Latest available lots</h2>
              {latest.length === 0 && <div className="sd-empty">No available lots yet. Check back soon.</div>}
              <div className="bd-latest">
                {latest.map(lot => (
                  <article className="bd-lot" key={lot.id}>
                    <LotPhotos lot={lot} mapUrl={'/map?lot=' + lot.id} />
                    <h3>{lot.title}</h3>
                    <span className="mu">{lot.barangay} · {Math.round(lot.area_sqm)} m² · {lot.land_type}</span>
                    <b>{peso(lot.price)}</b>
                    <div className="row"><Link className="bd-link lime" to={'/map?lot=' + lot.id}>View on map</Link></div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}

        {!dataLoading && tab === 'saved' && (
          <div className="sd-card">
            <div className="sd-section-head"><div><h2>Saved lots</h2><p className="mu">Select up to three lots to compare.</p></div>{compareIds.length > 0 && <button type="button" onClick={() => setCompareIds([])}>Clear comparison</button>}</div>
            {saved.length === 0 && (
              <div className="sd-empty">You haven’t saved any lots yet. Open a lot on the map and tap Save.<div className="row" style={{ justifyContent: 'center' }}><Link className="bd-link lime" to="/map">Browse the map</Link></div></div>
            )}
            {saved.map(lot => (
              <article className="sd-lot" key={lot.id}>
                <LotPhotos lot={lot} mapUrl={'/map?lot=' + lot.id} className="lot-photo-compact" />
                <div className="sd-lot-copy">
                  <h3>{lot.title}</h3>
                  <span className="mu">{lot.barangay} · {Math.round(lot.area_sqm)} m² · {peso(lot.price)} · {lot.land_type}</span><br />
                  <span className={'badge ' + lot.status}>{lot.status}</span>{' '}
                  <span className="mu">{lot.seller_phone ? <>Seller: {lot.seller_name || 'seller'} · <a href={'tel:' + lot.seller_phone}>{lot.seller_phone}</a></> : 'No contact number listed'}</span>
                  {lot.status !== 'available' && <div className="mu">This lot is {lot.status} and may no longer be open to buyers.</div>}
                </div>
                <div className="sd-lot-actions">
                  <button type="button" className={compareIds.includes(lot.id) ? 'compare-on' : ''} aria-pressed={compareIds.includes(lot.id)} onClick={() => toggleCompare(lot)}>{compareIds.includes(lot.id) ? '✓ Comparing' : 'Compare'}</button>
                  <Link className="bd-link" to={'/map?lot=' + lot.id}>View on map</Link>
                  <button className="del" onClick={() => remove(lot)}>Remove</button>
                </div>
              </article>
            ))}

            {compared.length > 0 && (
              <section className="sd-compare" aria-labelledby="compare-title">
                <div className="sd-section-head"><div><span className="sd-eyebrow">Shortlist</span><h2 id="compare-title">Compare saved lots</h2></div><span className="mu">{compared.length} of 3 selected</span></div>
                <div className="sd-table-scroll"><table className="sd-compare-table"><tbody>
                  <tr><th scope="row">Lot</th>{compared.map(lot => <td key={lot.id}><strong>{lot.title}</strong><button type="button" onClick={() => toggleCompare(lot)} aria-label={`Remove ${lot.title} from comparison`}>×</button></td>)}</tr>
                  <tr><th scope="row">Price</th>{compared.map(lot => <td key={lot.id}>{peso(lot.price)}</td>)}</tr>
                  <tr><th scope="row">Area</th>{compared.map(lot => <td key={lot.id}>{Math.round(lot.area_sqm).toLocaleString()} m²</td>)}</tr>
                  <tr><th scope="row">Price per m²</th>{compared.map(lot => <td key={lot.id}>{lot.area_sqm ? peso(Math.round(lot.price / lot.area_sqm)) : '-'}</td>)}</tr>
                  <tr><th scope="row">Barangay</th>{compared.map(lot => <td key={lot.id}>{lot.barangay}</td>)}</tr>
                  <tr><th scope="row">Land type</th>{compared.map(lot => <td key={lot.id}>{lot.land_type}</td>)}</tr>
                  <tr><th scope="row">Status</th>{compared.map(lot => <td key={lot.id}><span className={'badge ' + lot.status}>{lot.status}</span></td>)}</tr>
                  <tr><th scope="row">Nearest road</th>{compared.map(lot => <td key={lot.id}>{lot.nearest_road || '-'}</td>)}</tr>
                  <tr><th scope="row">Contact</th>{compared.map(lot => <td key={lot.id}>{lot.seller_phone ? <a href={'tel:' + lot.seller_phone}>{lot.seller_phone}</a> : '-'}</td>)}</tr>
                  <tr><th scope="row">Map</th>{compared.map(lot => <td key={lot.id}><Link className="bd-link" to={'/map?lot=' + lot.id}>Open lot</Link></td>)}</tr>
                </tbody></table></div>
              </section>
            )}
          </div>
        )}

        {!dataLoading && tab === 'profile' && profile && <ProfileTab profile={profile} setProfile={setProfile} flash={flash} />}
      </main>
    </>
  )
}
