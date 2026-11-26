import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import MapPage from './pages/MapPage.jsx'
import Seller from './pages/Seller.jsx'
import Buyer from './pages/Buyer.jsx'

const PAGE_TITLES = {
  '/': 'AriLaya | Find and list land in Mamburao',
  '/login': 'Sign in | AriLaya',
  '/map': 'Explore lots | AriLaya',
  '/seller': 'Seller dashboard | AriLaya',
  '/buyer': 'Buyer dashboard | AriLaya'
}

function PageEffects() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    document.title = PAGE_TITLES[pathname] || 'Page not found | AriLaya'
  }, [pathname])

  useEffect(() => {
    if (hash) {
      const frame = requestAnimationFrame(() => {
        document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
      })
      return () => cancelAnimationFrame(frame)
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])

  return null
}

function NotFound() {
  return (
    <>
      <Header />
      <main id="main-content" className="not-found" tabIndex={-1}>
        <span className="not-found-code" aria-hidden="true">404</span>
        <h1>This page isn’t on the map.</h1>
        <p>The link may be outdated, or the page may have moved. Let’s get you back to exploring Mamburao.</p>
        <div className="not-found-actions">
          <Link className="btn primary" to="/">Back to home</Link>
          <Link className="btn" to="/map">Explore lots</Link>
        </div>
      </main>
    </>
  )
}

export default function App() {
  return (
    <>
      <PageEffects />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/seller" element={<Seller />} />
        <Route path="/buyer" element={<Buyer />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
