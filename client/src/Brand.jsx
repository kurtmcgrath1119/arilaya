import { Link } from 'react-router-dom'

export default function Brand({ inverted = false, className = '' }) {
  return (
    <Link
      to="/"
      className={`brand${inverted ? ' brand-inverted' : ''}${className ? ` ${className}` : ''}`}
      aria-label="AriLaya home"
    >
      <span className="brand-mark">
        <img src="/logo.jpg" alt="" width="44" height="44" />
      </span>
      <span className="brand-name">AriLaya</span>
    </Link>
  )
}
