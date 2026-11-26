import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import Brand from './Brand'

export default function Header({ subtitle }) {
  const { user, logout } = useAuth()
  const { pathname, hash } = useLocation()
  const nav = useNavigate()
  const menuId = useId()
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)
  const [supportsPopover] = useState(() => typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype)
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => {
    const menu = menuRef.current
    if (supportsPopover) {
      if (menu?.matches(':popover-open')) menu.hidePopover()
    } else {
      setMenuOpen(false)
    }
  }

  const toggleMenu = () => {
    const menu = menuRef.current
    if (!supportsPopover || !menu) return setMenuOpen(current => !current)
    if (menu.matches(':popover-open')) menu.hidePopover()
    else menu.showPopover()
  }

  useEffect(() => {
    if (supportsPopover || !menuOpen) return
    const onKeyDown = event => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, supportsPopover])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)')
    const closeOnDesktop = () => {
      if (!desktop.matches) return
      const menu = menuRef.current
      if (supportsPopover && menu?.matches(':popover-open')) menu.hidePopover()
      else if (!supportsPopover) setMenuOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [supportsPopover])

  const signOut = async () => {
    closeMenu()
    await logout()
    nav('/')
  }

  const links = [
    { to: '/', label: 'Home', current: pathname === '/' && !hash },
    { to: '/map', label: 'Find lots', current: pathname === '/map' },
    { to: '/#about', label: 'About' },
    { to: '/#how-it-works', label: 'How it works' }
  ]

  return (
    <header className="hd">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Brand />
      {subtitle && <span className="hd-sub">{subtitle}</span>}

      <nav className="hd-nav" aria-label="Primary navigation">
        <button
          ref={menuButtonRef}
          type="button"
          className="hd-menu-toggle"
          aria-controls={menuId}
          aria-expanded={menuOpen}
          {...(supportsPopover ? { popoverTarget: menuId, popoverTargetAction: 'toggle' } : {})}
          onClick={supportsPopover ? undefined : toggleMenu}
        >
          <span className="menu-icon" aria-hidden="true"><i /><i /><i /></span>
          <span>Menu</span>
        </button>
        <div
          ref={menuRef}
          id={menuId}
          className="hd-links"
          {...(supportsPopover ? { popover: 'auto' } : {})}
          hidden={!supportsPopover && !menuOpen}
          onToggle={event => setMenuOpen(event.newState === 'open')}
        >
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={link.current ? 'page' : undefined}
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <button type="button" className="hd-mobile-signout" onClick={signOut}>Sign out</button>
          )}
        </div>
      </nav>

      <div className="hd-user">
        {user ? (
          <>
            <span className="hd-user-name">
              {user.picture && <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />}
              {user.name}<span className="role-tag">{user.role}</span>
            </span>
            <Link className="hd-dashboard" to={user.role === 'seller' ? '/seller' : '/buyer'}>Dashboard</Link>
            <button className="hd-btn hd-signout" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <Link className="hd-btn" to="/login?role=buyer">Sign in</Link>
        )}
      </div>
    </header>
  )
}
