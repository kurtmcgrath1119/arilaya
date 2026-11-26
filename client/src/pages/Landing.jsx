import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, BARANGAYS, peso } from '../api'
import { useAuth } from '../useAuth'
import Brand from '../Brand'
import Header from '../Header'
import LotPhotos from '../LotPhotos'
import './home.css'

const ICONS = {
  map: 'M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z M9 4v13 M15 7v13',
  filter: 'M3 5h18l-7 8v6l-4-2v-4L3 5z',
  list: 'M5 4h14v16H5z M8 9h8 M8 13h8 M8 17h5',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 8v4 M10 10h4',
  dash: 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z M9 12l2 2 4-4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10',
  ruler: 'M4 16 16 4l4 4L8 20z M9 11l2 2 M12 8l2 2 M6 14l2 2',
  phone: 'M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2c-3-1.3-5.7-4-7-7l2-2z'
}

function Icon({ name }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
  )
}

const BUYER = [
  { i: 'map', t: 'Browse the map', d: 'See admin-reviewed lots across Mamburao on a street or satellite map.' },
  { i: 'search', t: 'Search your way', d: 'Search by road or landmark, or choose a barangay and land type.' },
  { i: 'filter', t: 'Filter to fit', d: 'Narrow lots by price, size, status, and distance from a landmark.' },
  { i: 'phone', t: 'Contact the seller', d: 'Open a lot to see its boundary, photos, price, and seller contact.' }
]
const SELLER = [
  { i: 'user', t: 'Create an account', d: 'Sign up with your email or your Google account.' },
  { i: 'pin', t: 'Mark your lot', d: 'Place the lot’s corners on the map and let AriLaya estimate its size.' },
  { i: 'eye', t: 'Add clear photos', d: 'Show the lot, access road, and surroundings to help buyers decide.' },
  { i: 'dash', t: 'Manage your listings', d: 'Edit details and update the status as available, reserved, or sold.' }
]
const STEPS = [
  ['Post the lot', 'A seller marks the boundary, adds details, and uploads photos.'],
  ['Admin review', 'The listing is checked before it appears to buyers.'],
  ['Search and compare', 'Buyers filter the map, open photos, and save promising lots.'],
  ['Arrange a visit', 'Buyers contact the seller directly and confirm the property.']
]
const FAQS = [
  ['Is AriLaya free to browse?', 'Yes. Buyers can search approved listings, open lot photos, view boundaries, and see seller contact details without paying a fee.'],
  ['How accurate are the lot boundaries?', 'Sellers draw the corners on the map, and AriLaya estimates the area from those points. Boundaries are approximate and must be confirmed by a licensed geodetic engineer.'],
  ['When will my listing appear on the map?', 'New listings and edits are reviewed by an administrator first. You can track the review state in your seller dashboard.'],
  ['Does AriLaya handle payments or land titles?', 'No. AriLaya is a discovery and listing platform. Buyers and sellers handle payment, documents, and title verification directly.'],
  ['How do I contact a seller?', 'Open a lot on the map and use the contact number shown in its details. You can also save the lot and return to it from your buyer dashboard.']
]

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState('buyer')
  const [query, setQuery] = useState('')
  const [barangay, setBarangay] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const dashboard = user ? (user.role === 'seller' ? '/seller' : '/buyer') : null
  const sellerLink = user?.role === 'seller' ? '/seller' : '/login?mode=register&role=seller'

  useEffect(() => {
    let active = true
    api('/api/lots')
      .then(data => { if (active) setLots(data) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const { available, barangays, latest, lowestPrice } = useMemo(() => {
    const open = lots.filter(lot => lot.status === 'available')
    return {
      available: open,
      barangays: new Set(open.map(lot => lot.barangay)).size,
      latest: [...open].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 3),
      lowestPrice: open.length ? Math.min(...open.map(lot => lot.price)) : null
    }
  }, [lots])

  function quickSearch(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (barangay) params.set('brgy', barangay)
    if (maxPrice) params.set('pmax', maxPrice)
    navigate('/map' + (params.size ? '?' + params.toString() : ''))
  }

  const points = role === 'buyer' ? BUYER : SELLER

  return (
    <div className="hm">
      <Header />

      <main id="main-content" tabIndex={-1}>
        <section className="hm-hero" aria-labelledby="hero-title">
          <div className="hm-hero-copy">
            <span className="hm-kicker"><span />Land discovery, made local</span>
            <h1 id="hero-title">Find the lot that fits <em>your future.</em></h1>
            <p className="hm-hero-lead">Explore mapped lots in Mamburao, compare photos and prices, and connect directly with sellers—all before you visit.</p>
            <div className="hm-actions">
              <Link className="hm-btn hm-btn-primary" to="/map">Explore lots <span aria-hidden="true">→</span></Link>
              {user
                ? <Link className="hm-btn hm-btn-secondary" to={dashboard}>Open my dashboard</Link>
                : <Link className="hm-btn hm-btn-secondary" to="/login?mode=register&role=buyer">Create an account</Link>}
            </div>

            <form className="hm-quick-search" onSubmit={quickSearch} aria-label="Quick lot search">
              <div className="hm-search-heading"><Icon name="search" /><span>Start your search</span></div>
              <div className="hm-search-field hm-search-wide">
                <label htmlFor="home-search">Road, landmark, or keyword</label>
                <input id="home-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. National Highway" />
              </div>
              <div className="hm-search-field">
                <label htmlFor="home-barangay">Barangay</label>
                <select id="home-barangay" value={barangay} onChange={event => setBarangay(event.target.value)}>
                  <option value="">Any barangay</option>
                  {BARANGAYS.map(item => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="hm-search-field">
                <label htmlFor="home-budget">Maximum budget</label>
                <select id="home-budget" value={maxPrice} onChange={event => setMaxPrice(event.target.value)}>
                  <option value="">Any budget</option>
                  <option value="500000">Up to ₱500,000</option>
                  <option value="1000000">Up to ₱1 million</option>
                  <option value="2000000">Up to ₱2 million</option>
                  <option value="5000000">Up to ₱5 million</option>
                </select>
              </div>
              <button className="hm-search-submit" type="submit">Find lots <span aria-hidden="true">→</span></button>
            </form>
          </div>

          <div className="hm-hero-visual">
            <img src="/welcome.jpg" alt="A family looking toward their future in an open field at sunset" width="1600" height="1067" fetchPriority="high" />
            <div className="hm-hero-shade" />
            <div className="hm-location-card">
              <span className="hm-location-icon"><Icon name="pin" /></span>
              <div><strong>Mamburao</strong><span>Occidental Mindoro</span></div>
            </div>
            <div className="hm-live-card">
              <span className="hm-live-dot" />
              <div><strong>{loading ? '—' : available.length}</strong><span>{available.length === 1 ? 'lot available now' : 'lots available now'}</span></div>
              <Link to="/map" aria-label="View available lots on the map">View map</Link>
            </div>
          </div>
        </section>

        <section className="hm-trust" aria-label="AriLaya at a glance">
          <div><Icon name="shield" /><span><strong>Admin-reviewed</strong>Listings checked before publication</span></div>
          <div><Icon name="map" /><span><strong>Mapped boundaries</strong>See the shape of each lot</span></div>
          <div><Icon name="eye" /><span><strong>Photo galleries</strong>Preview before you visit</span></div>
          <div><Icon name="home" /><span><strong>Made for Mamburao</strong>Focused on the local community</span></div>
        </section>

        <section className="hm-section hm-featured" id="lots" aria-labelledby="featured-title">
          <div className="hm-section-head hm-reveal">
            <div><span className="hm-eyebrow">Live inventory</span><h2 id="featured-title">Lots worth a closer look</h2></div>
            <Link className="hm-text-link" to="/map">View all lots <span aria-hidden="true">→</span></Link>
          </div>
          <div className="hm-inventory-stats hm-reveal">
            <div><strong>{loading ? '—' : available.length}</strong><span>Available now</span></div>
            <div><strong>{loading ? '—' : barangays}</strong><span>Barangays represented</span></div>
            <div><strong>{loading || lowestPrice === null ? '—' : peso(lowestPrice)}</strong><span>Lowest available price</span></div>
            <p>Live from the AriLaya listing database. Status can change as sellers update their lots.</p>
          </div>
          {error && <div className="hm-notice" role="status">Live inventory is unavailable right now. You can still open the map to try again.</div>}
          {loading && <div className="hm-listing-grid" aria-label="Loading featured lots"><div className="hm-lot-skeleton" /><div className="hm-lot-skeleton" /><div className="hm-lot-skeleton" /></div>}
          {!loading && !error && latest.length > 0 && (
            <div className="hm-listing-grid hm-reveal">
              {latest.map(lot => (
                <article className="hm-lot-card" key={lot.id}>
                  <LotPhotos lot={lot} mapUrl={'/map?lot=' + lot.id} />
                  <div className="hm-lot-body">
                    <div className="hm-lot-top"><span className="badge available">Available</span><span>{lot.land_type}</span></div>
                    <h3><Link to={'/map?lot=' + lot.id}>{lot.title}</Link></h3>
                    <p className="hm-lot-location"><Icon name="pin" />{lot.barangay}{lot.nearest_road ? ` · ${lot.nearest_road}` : ''}</p>
                    <div className="hm-lot-facts"><span><Icon name="ruler" />{Math.round(lot.area_sqm).toLocaleString()} m²</span><span>{lot.area_sqm ? peso(Math.round(lot.price / lot.area_sqm)) + ' / m²' : 'Price on request'}</span></div>
                    <div className="hm-lot-footer"><strong>{peso(lot.price)}</strong><Link to={'/map?lot=' + lot.id}>View details <span aria-hidden="true">→</span></Link></div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!loading && !error && latest.length === 0 && (
            <div className="hm-empty hm-reveal"><Icon name="home" /><h3>No available lots yet</h3><p>Check back soon, or create a seller account to publish the first listing.</p><Link className="hm-btn hm-btn-primary" to={sellerLink}>List a lot</Link></div>
          )}
        </section>

        <section className="hm-section hm-about hm-reveal" id="about" aria-labelledby="about-title">
          <div className="hm-about-visual">
            <img src="/hero.jpg" alt="Aerial view of Mamburao, its neighborhoods, airport, and coastline" width="1024" height="768" loading="lazy" />
            <div className="hm-about-badge"><Icon name="map" /><span><strong>One map. Clearer decisions.</strong>Search locally before you travel.</span></div>
          </div>
          <div className="hm-about-copy">
            <span className="hm-eyebrow">Why AriLaya</span>
            <h2 id="about-title">A clearer way to find land in Mamburao</h2>
            <p>Finding a lot often means asking around and piecing together details from different people. AriLaya brings location, boundary, size, price, photos, and contact information into one place.</p>
            <ul className="hm-checks">
              <li><span>✓</span>See where a lot is before arranging a visit.</li>
              <li><span>✓</span>Compare size, price, land type, and nearby landmarks.</li>
              <li><span>✓</span>Connect directly with the seller—no payment processing.</li>
            </ul>
            <div className="hm-disclaimer"><Icon name="shield" /><p>AriLaya supports discovery, not legal verification. Always confirm documents, ownership, and boundaries with the proper professionals.</p></div>
          </div>
        </section>

        <section className="hm-section hm-features hm-reveal" id="features" aria-labelledby="features-title">
          <div className="hm-section-head hm-center">
            <span className="hm-eyebrow">Built for both sides</span>
            <h2 id="features-title">Whether you’re buying or selling</h2>
            <p>Simple tools for finding the right property—or helping the right buyer find yours.</p>
          </div>
          <div className="hm-role-switch" role="group" aria-label="Choose your role">
            <button type="button" className={role === 'buyer' ? 'on' : ''} aria-pressed={role === 'buyer'} onClick={() => setRole('buyer')}>I’m a buyer</button>
            <button type="button" className={role === 'seller' ? 'on' : ''} aria-pressed={role === 'seller'} onClick={() => setRole('seller')}>I’m a seller</button>
          </div>
          <div className="hm-feature-grid" key={role}>
            {points.map((point, index) => (
              <article className="hm-feature-card" key={point.t} style={{ '--delay': `${index * 55}ms` }}>
                <span className="hm-feature-icon"><Icon name={point.i} /></span>
                <h3>{point.t}</h3><p>{point.d}</p>
              </article>
            ))}
          </div>
          <div className="hm-feature-cta">
            {role === 'buyer'
              ? <Link className="hm-btn hm-btn-primary" to="/map">Start exploring</Link>
              : <Link className="hm-btn hm-btn-primary" to={sellerLink}>{user?.role === 'seller' ? 'Open seller dashboard' : 'Become a seller'}</Link>}
          </div>
        </section>

        <section className="hm-section hm-how hm-reveal" id="how-it-works" aria-labelledby="how-title">
          <div className="hm-section-head hm-center">
            <span className="hm-eyebrow">How it works</span>
            <h2 id="how-title">From listing to site visit</h2>
          </div>
          <ol className="hm-steps">
            {STEPS.map(([title, description], index) => (
              <li key={title}><span className="hm-step-number">{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{description}</p></li>
            ))}
          </ol>
        </section>

        <section className="hm-section hm-faq hm-reveal" id="faq" aria-labelledby="faq-title">
          <div className="hm-faq-intro"><span className="hm-eyebrow">Good to know</span><h2 id="faq-title">Questions before you start</h2><p>Clear expectations make better property decisions.</p><Link className="hm-text-link" to="/map">Explore the map <span aria-hidden="true">→</span></Link></div>
          <div className="hm-faq-list">
            {FAQS.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="hm-final-cta hm-reveal" aria-labelledby="cta-title">
          <div><span className="hm-eyebrow">Your next move</span><h2 id="cta-title">Ready to find your place in Mamburao?</h2><p>Explore what’s available today, or list your lot and let local buyers find you.</p></div>
          <div className="hm-actions"><Link className="hm-btn hm-btn-primary" to="/map">Browse the map</Link><Link className="hm-btn hm-btn-light" to={sellerLink}>{user?.role === 'seller' ? 'Manage listings' : 'List your lot'}</Link></div>
        </section>
      </main>

      <footer className="hm-foot">
        <div className="hm-foot-brand"><Brand inverted /><p>A GIS-based platform for discovering, mapping, and listing land in Mamburao, Occidental Mindoro.</p></div>
        <div><h3>Explore</h3><Link to="/map">Browse lots</Link><Link to="/#how-it-works">How it works</Link><Link to="/#about">About AriLaya</Link></div>
        <div><h3>Accounts</h3><Link to="/login?role=buyer">Buyer sign in</Link><Link to="/login?role=seller">Seller sign in</Link><a href="/admin.html">Administrator</a></div>
        <div className="hm-foot-note"><span>Local focus</span><p>Mamburao, Occidental Mindoro</p><p>Lot boundaries are approximate and do not replace an official land survey.</p></div>
        <div className="hm-copy">© AriLaya. All rights reserved.</div>
      </footer>
    </div>
  )
}
