import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api, peso } from '../api'
import { useAuth } from '../AuthContext'
import Header from '../Header'
import './seller.css'

function ProfileTab({ profile, setProfile, flash }) {
  const [v, setV] = useState({
    phone: profile.phone || '', street: profile.street || '', barangay: profile.barangay || '',
    city: profile.city || '', province: profile.province || ''
  })
  const [err, setErr] = useState('')
  const set = k => e => setV({ ...v, [k]: e.target.value })

  async function save() {
    setErr('')
    try {
      await api('/api/buyer/profile', { method: 'PATCH', body: v })
      setProfile({ ...profile, ...v })
      flash('Profile saved.')
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="sd-card" style={{ maxWidth: 560 }}>
      <h3>Your profile</h3>
      <table><tbody>
        <tr><td>Name</td><td>{profile.name}</td></tr>
        <tr><td>Email</td><td>{profile.email}</td></tr>
        <tr><td>Member since</td><td>{(profile.created_at || '').slice(0, 10)}</td></tr>
      </tbody></table>
      <label>Contact number</label>
      <input value={v.phone} onChange={set('phone')} placeholder="09171234567" inputMode="tel" />
      <label>House No. / Street / Purok</label>
      <input value={v.street} onChange={set('street')} />
      <div className="two">
        <div><label>Barangay</label><input value={v.barangay} onChange={set('barangay')} /></div>
        <div><label>City / Municipality</label><input value={v.city} onChange={set('city')} /></div>
      </div>
      <label>Province</label>
      <input value={v.province} onChange={set('province')} />
      {err && <div className="err">{err}</div>}
      <div className="row"><button className="pri" onClick={save}>Save changes</button></div>
    </div>
  )
}

export default function Buyer() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState('overview')
  const [saved, setSaved] = useState([])
  const [lots, setLots] = useState([])
  const [profile, setProfile] = useState(null)
  const [toast, setToast] = useState('')

  const flash = t => { setToast(t); setTimeout(() => setToast(''), 4000) }

  useEffect(() => {
    if (user?.role === 'buyer') {
      api('/api/buyer/favorites').then(setSaved).catch(() => {})
      api('/api/lots').then(setLots).catch(() => {})
      api('/api/buyer/profile').then(setProfile).catch(() => {})
    }
  }, [user])

  if (loading) return null
  if (!user || user.role !== 'buyer') return <Navigate to="/login?role=buyer" replace />

  const available = lots.filter(l => l.status === 'available')
  const latest = available.slice(0, 3)
  const barangays = new Set(available.map(l => l.barangay)).size
  const savedAvailable = saved.filter(l => l.status === 'available').length

  async function remove(l) {
    try {
      await api('/api/buyer/favorites/' + l.id, { method: 'DELETE' })
      setSaved(s => s.filter(x => x.id !== l.id))
      flash('Removed from saved lots.')
    } catch (e) { flash(e.message) }
  }

  const steps = [
    ['Create your account', true],
    ['Add your contact number', !!profile?.phone],
    ['Save your first lot', saved.length > 0]
  ]

  return (
    <>
      <Header subtitle="Buyer" />
      <main className="sd">
        <section className="sd-hero">
          <div>
            <span className="sd-eyebrow">Buyer dashboard</span>
            <h2>Welcome, {user.name.split(' ')[0]}</h2>
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

        <div className="sd-tabs">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}>Saved lots ({saved.length})</button>
          <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Profile</button>
        </div>

        {toast && <div className="sd-toast">{toast}</div>}

        {tab === 'overview' && (
          <>
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
                <h3>Tips for finding a lot</h3>
                <p className="mu">Use the filters on the map to narrow lots by barangay, price, size, land type, and distance from a landmark.</p>
                <p className="mu">Tap <b>Save</b> on a lot to add it to your shortlist, so you can compare lots later.</p>
                <p className="mu">Boundaries are approximate. Visit the site and confirm the lot with the seller and a licensed geodetic engineer before deciding.</p>
              </div>
            </div>

            <div className="sd-card sd-full">
              <h3>Latest available lots</h3>
              {latest.length === 0 && <div className="sd-empty">No available lots yet. Check back soon.</div>}
              <div className="bd-latest">
                {latest.map(l => (
                  <div className="bd-lot" key={l.id}>
                    <b>{l.title}</b>
                    <span className="mu">{l.barangay} · {Math.round(l.area_sqm)} m² · {l.land_type}</span>
                    <b>{peso(l.price)}</b>
                    <div className="row"><Link className="bd-link lime" to={'/map?lot=' + l.id}>View on map</Link></div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'saved' && (
          <div className="sd-card">
            <h3>Saved lots</h3>
            {saved.length === 0 && (
              <div className="sd-empty">
                You haven’t saved any lots yet. Open a lot on the map and tap Save.
                <div className="row" style={{ justifyContent: 'center' }}><Link className="bd-link lime" to="/map">Browse the map</Link></div>
              </div>
            )}
            {saved.map(l => (
              <div className="sd-lot" key={l.id}>
                <div>
                  <b>{l.title}</b>
                  <span className="mu">{l.barangay} · {Math.round(l.area_sqm)} m² · {peso(l.price)} · {l.land_type}</span><br />
                  <span className={'badge ' + l.status}>{l.status}</span>{' '}
                  <span className="mu">
                    {l.seller_phone
                      ? <>Seller: {l.seller_name || 'seller'} · <a href={'tel:' + l.seller_phone}>{l.seller_phone}</a></>
                      : 'No contact number listed'}
                  </span>
                  {l.status !== 'available' && <div className="mu">This lot is {l.status} and may no longer be open to buyers.</div>}
                </div>
                <div className="sd-lot-actions">
                  <Link className="bd-link" to={'/map?lot=' + l.id}>View on map</Link>
                  <button className="del" onClick={() => remove(l)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'profile' && profile && <ProfileTab profile={profile} setProfile={setProfile} flash={flash} />}
      </main>
    </>
  )
}