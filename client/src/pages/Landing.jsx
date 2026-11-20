import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
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
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13 7l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  gift: 'M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7c-2 0-4-1-4-3s3-2 4 3c1-5 4-5 4-3s-2 3-4 3z',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10'
}
function Icon({ n }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>
  )
}

function Reveal({ children, className = '' }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) { setOn(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`hm-reveal ${on ? 'in' : ''} ${className}`}>{children}</div>
}



function PinArt() {
  return (
    <div className="hm-stage">
      <div className="hm-disc" />
      <div className="hm-glow" />
      <svg viewBox="0 0 320 430" className="hm-pin" role="img" aria-label="Aerial photo of Mamburao inside a map pin">
        <defs>
          <clipPath id="hmpinclip"><circle cx="160" cy="146" r="112" /></clipPath>
        </defs>
        <ellipse className="hm-ripple" cx="160" cy="412" rx="46" ry="10" />
        <ellipse className="hm-ripple r2" cx="160" cy="412" rx="46" ry="10" />
        <path d="M160 8 C86 8 28 66 28 140 C28 232 132 312 160 404 C188 312 292 232 292 140 C292 66 234 8 160 8 Z" fill="#fff" />
        <image className="hm-photo" href="/hero.jpg" x="48" y="34" width="224" height="224"
          preserveAspectRatio="xMidYMid slice" clipPath="url(#hmpinclip)" />
        <circle cx="160" cy="146" r="112" fill="none" stroke="#8dc63f" strokeWidth="5" />
        <ellipse cx="160" cy="412" rx="12" ry="7" fill="#8dc63f" />
      </svg>
      <span className="hm-chip c1"><i />Available lot</span>
      <span className="hm-chip c2">Boundary on map</span>
    </div>
  )
}



const BUYER = [
  { i: 'map', t: 'Browse the map', d: 'See available lots across Mamburao on a street or satellite map.' },
  { i: 'search', t: 'Search your way', d: 'Search by road or landmark, or choose a barangay.' },
  { i: 'filter', t: 'Filter to fit', d: 'Narrow lots by price, size, land type, status, and distance from a landmark.' },
  { i: 'list', t: 'See the details', d: 'Open a lot to view its boundary, size, price, land type, and seller contact.' }
]
const SELLER = [
  { i: 'user', t: 'Create an account', d: 'Sign up with your email or your Google account.' },
  { i: 'pin', t: 'Mark your lot', d: 'Click the corners of your lot on the map, and AriLaya computes its size for you.' },
  { i: 'dash', t: 'Manage your listings', d: 'Edit a lot or update its status as available, reserved, or sold.' },
  { i: 'eye', t: 'Reach more buyers', d: 'Approved listings appear on the public map for buyers to find.' }
]
const STEPS = [
  ['Sellers mark their lot', 'Draw the lot’s corners on the map and add its details.'],
  ['An administrator reviews it', 'New listings are checked before they go live.'],
  ['Buyers search the map', 'Filter by barangay, price, size, and landmarks.'],
  ['Buyers contact the seller', 'Use the contact number on the listing and arrange a site visit.']
]

export default function Landing() {
  const { user } = useAuth()
  const [role, setRole] = useState('buyer')
   const home = user ? (user.role === 'seller' ? '/seller' : '/buyer') : null
  const points = role === 'buyer' ? BUYER : SELLER

  return (
    <div className="hm">
      <header className="hm-nav">
        <Link to="/" className="hm-logo"><span className="hm-dot" />AriLaya</Link>
        <nav className="hm-links">
          <a href="#about">About</a>
          <a href="#features">What you can do</a>
          <a href="#how">How it works</a>
          <Link to="/map">Lots</Link>
        </nav>
        {user
          ? <Link className="hm-btn out sm" to={home}>Hi, {user.name.split(' ')[0]}</Link>
          : <Link className="hm-btn out sm" to="/login?role=buyer">Sign in</Link>}
      </header>

      {/* ---------- hero ---------- */}
      <section className="hm-hero">
        <div className="hm-hero-text">
          <span className="hm-pill hm-in"><i />Welcome to AriLaya</span>
          <h1 className="hm-in d1">Find the lot that fits <em>your future.</em></h1>
          <p className="hm-in d2">AriLaya is a map-based lot finder for Mamburao, Occidental Mindoro. See available lots, their boundaries, size, price, and seller contact, all in one place.</p>
          <div className="hm-actions hm-in d3">
            <Link className="hm-btn lime" to="/map">Browse the map</Link>
            {user
              ? <Link className="hm-btn out" to={home}>Go to my account</Link>
              : <Link className="hm-btn out" to="/login?mode=register&role=buyer">Create an account</Link>}
          </div>
        </div>
        <div className="hm-hero-photo">
          <img className="hm-hero-img" src="/welcome.jpg" alt="A family standing together in an open field at sunset" />
          <div className="hm-ring" />
          <div className="hm-float">
            <div className="ic"><Icon n="pin" /></div>
            <div><b>Lots across Mamburao</b><span>View boundaries on the map</span></div>
          </div>
        </div>
      </section>

      {/* ---------- trust strip ---------- */}
      <Reveal>
        <div className="hm-strip">
          <div><span className="ic"><Icon n="home" /></span>Made for Mamburao</div>
          <div><span className="ic"><Icon n="gift" /></span>Free to browse</div>
          <div><span className="ic"><Icon n="map" /></span>Boundaries on the map</div>
          <div><span className="ic"><Icon n="shield" /></span>Listings reviewed</div>
        </div>
      </Reveal>

      {/* ---------- about ---------- */}
      <section className="hm-sec" id="about">
        <Reveal>
          <div className="hm-about">
                        <PinArt />
            <div>
              <span className="hm-eyebrow">About AriLaya</span>
              <h2 className="hm-h2">Looking for land in Mamburao, made simpler</h2>
              <p className="hm-lead">Finding a lot usually means asking around, visiting sites, and piecing together details from different people. AriLaya puts available lots on one interactive map, so buyers can see where a lot is, how big it is, and who to contact before they visit.</p>
              <ul className="hm-checks">
                <li><i>✓</i>Sellers post their own lots by marking the boundary on the map.</li>
                <li><i>✓</i>An administrator reviews listings before buyers see them.</li>
                <li><i>✓</i>AriLaya connects buyers and sellers. It does not handle payments or land titles.</li>
                <li><i>✓</i>Boundaries are approximate until confirmed by a licensed geodetic engineer.</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- what you can do ---------- */}
      <section className="hm-sec" id="features">
        <Reveal>
          <div className="hm-center">
            <span className="hm-eyebrow">What you can do</span>
            <h2 className="hm-h2">Whether you’re buying or selling, it starts here</h2>
          </div>
          <div className="hm-tabs" role="tablist">
            <button role="tab" aria-selected={role === 'buyer'} className={role === 'buyer' ? 'on' : ''} onClick={() => setRole('buyer')}>I’m a buyer</button>
            <button role="tab" aria-selected={role === 'seller'} className={role === 'seller' ? 'on' : ''} onClick={() => setRole('seller')}>I’m a seller</button>
          </div>
          <div className="hm-grid" key={role}>
            {points.map(p => (
              <div className="hm-card" key={p.t}>
                <div className="ic"><Icon n={p.i} /></div>
                <div><h3>{p.t}</h3><p>{p.d}</p></div>
              </div>
            ))}
          </div>
          <div className="hm-tab-cta">
            {role === 'buyer'
              ? <Link className="hm-btn dark" to="/login?role=buyer">Sign in as a buyer</Link>
              : <Link className="hm-btn dark" to="/login?role=seller">Sign in as a seller</Link>}
          </div>
        </Reveal>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="hm-sec" id="how">
        <Reveal>
          <div className="hm-center">
            <span className="hm-eyebrow">How it works</span>
            <h2 className="hm-h2">From listing to site visit in four steps</h2>
          </div>
          <div className="hm-steps">
            {STEPS.map(([t, d], i) => (
              <div className="hm-step" key={t}>
                <div className="hm-num">{i + 1}</div>
                <h3>{t}</h3><p>{d}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- call to action ---------- */}
      <Reveal>
        <section className="hm-cta">
          <h2>Ready to find your place in Mamburao?</h2>
          <p>Explore the map to see what’s available, or list your own lot and let buyers find it.</p>
          <div className="hm-actions">
            <Link className="hm-btn lime" to="/map">Browse the map</Link>
            <Link className="hm-btn out" to="/login?role=seller">List your lot</Link>
          </div>
        </section>
      </Reveal>

      {/* ---------- footer ---------- */}
      <footer className="hm-foot">
        <div>
          <Link to="/" className="hm-logo"><span className="hm-dot" />AriLaya</Link>
          <p style={{ margin: 0, maxWidth: 340, lineHeight: 1.7 }}>A GIS-based web platform for listing, mapping, and searching available lots in Mamburao, Occidental Mindoro.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/map">Browse lots</Link>
          <a href="#how">How it works</a>
          <a href="#about">About</a>
        </div>
        <div>
          <h4>Accounts</h4>
          <Link to="/login?role=buyer">Buyer sign in</Link>
          <Link to="/login?role=seller">Seller sign in</Link>
          <a href="/admin.html">Admin</a>
        </div>
        <div className="hm-copy">© AriLaya · Lot boundaries shown are approximate and do not replace an official land survey.</div>
      </footer>
    </div>
  )
}