import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './photos.css'

const urlOf = photo => typeof photo === 'string' ? photo : photo.url

export default function LotPhotos({ lot, onViewMap, mapUrl, className = '' }) {
  const photos = (lot.photos || []).map(urlOf).filter(Boolean)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [open])

  if (photos.length === 0) return <div className={`lot-photo-empty ${className}`}>No photos yet</div>

  const close = () => dialogRef.current?.close()
  const step = direction => setIndex(current => (current + direction + photos.length) % photos.length)
  const viewOnMap = () => {
    close()
    onViewMap?.(lot)
  }

  return (
    <>
      <button
        type="button"
        className={`lot-photo ${className}`}
        onClick={() => { setIndex(0); setOpen(true) }}
        aria-label={`View ${photos.length === 1 ? 'photo' : `${photos.length} photos`} of ${lot.title}`}
      >
        <img
          src={photos[0]}
          alt={`${lot.title}, photo 1`}
          width="1600"
          height="1200"
          loading="lazy"
        />
        {photos.length > 1 && <span className="lot-photo-count">{photos.length} photos</span>}
      </button>

      {open && (
        <dialog
          ref={dialogRef}
          className="photo-dialog"
          aria-labelledby={titleId}
          closedby="any"
          onClose={() => setOpen(false)}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') step(-1)
            if (e.key === 'ArrowRight') step(1)
          }}
        >
          <div className="photo-dialog-shell">
            <header className="photo-dialog-header">
              <div>
                <span>Photo gallery</span>
                <h1 id={titleId}>{lot.title}</h1>
              </div>
              <button type="button" className="photo-dialog-close" onClick={close} aria-label="Close photo gallery" autoFocus>×</button>
            </header>

            <div className="photo-stage">
              <button type="button" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
              <img
                key={photos[index]}
                src={photos[index]}
                alt={`${lot.title}, photo ${index + 1} of ${photos.length}`}
                width="1600"
                height="1200"
                fetchPriority="low"
              />
              <button type="button" onClick={() => step(1)} aria-label="Next photo">›</button>
            </div>

            <div className="photo-thumbnails" role="group" aria-label="Choose a photo">
              {photos.map((url, i) => (
                <button
                  type="button"
                  key={url}
                  className={i === index ? 'on' : ''}
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={i === index}
                >
                  <img src={url} alt="" width="320" height="240" loading="lazy" />
                </button>
              ))}
            </div>

            <footer className="photo-dialog-footer">
              <span>{index + 1} / {photos.length}</span>
              {(onViewMap || mapUrl) && (
                mapUrl
                  ? <Link className="photo-map-link" to={mapUrl} onClick={close}>View on map</Link>
                  : <button type="button" className="photo-map-link" onClick={viewOnMap}>View on map</button>
              )}
            </footer>
          </div>
        </dialog>
      )}
    </>
  )
}
