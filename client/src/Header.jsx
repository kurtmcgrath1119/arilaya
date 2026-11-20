import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function Header({ subtitle }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const nav = useNavigate()

  return (
    <header className="hd">
      <Link to="/" className="hd-logo"><span className="hd-dot" />AriLaya</Link>
      {subtitle && <span className="hd-sub">{subtitle}</span>}

      <nav className="hd-links">
        <Link to="/" className={pathname === '/' ? 'active' : ''}>Home</Link>
        <Link to="/map" className={pathname === '/map' ? 'active' : ''}>Lots</Link>
        <a href="/#about">About</a>
      </nav>

      <div className="hd-user">
        {user ? (
          <>
            <span>
              {user.picture && <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />}
              {user.name}<span className="role-tag">{user.role}</span>
            </span>
                        <Link to={user.role === 'seller' ? '/seller' : '/buyer'}>Dashboard</Link>
            <button className="hd-btn" onClick={async () => { await logout(); nav('/') }}>Sign out</button>
          </>
        ) : (
          <Link className="hd-btn" to="/login?role=buyer">Sign in</Link>
        )}
      </div>
    </header>
  )
}