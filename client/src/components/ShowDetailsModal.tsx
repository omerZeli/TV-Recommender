import { type FC, useEffect } from 'react'
import '../styles/ShowDetailsModal.css'

type TmdbTvResult = {
  id: number
  name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  vote_count: number
  original_name: string
  original_language: string
  origin_country: string[]
}

type ShowDetailsModalProps = {
  show: TmdbTvResult
  isOpen: boolean
  onClose: () => void
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

export const ShowDetailsModal: FC<ShowDetailsModalProps> = ({ show, isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-label={`${show.name} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{show.name}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            X
          </button>
        </div>
        
        <div className="modal-content">
          <div className="modal-image">
            {show.poster_path ? (
              <img
                src={`${TMDB_IMAGE_BASE}${show.poster_path}`}
                alt={`${show.name} poster`}
              />
            ) : (
              <div className="no-image">No image available</div>
            )}
          </div>

          <div className="modal-details">
            <div className="detail-row">
              <span className="label">Original Title:</span>
              <span className="value">{show.original_name}</span>
            </div>

            <div className="detail-row">
              <span className="label">First Air Date:</span>
              <span className="value">{show.first_air_date || 'Unknown'}</span>
            </div>

            <div className="detail-row">
              <span className="label">Rating:</span>
              <span className="value">
                ⭐ {show.vote_average.toFixed(1)} / 10 ({show.vote_count} votes)
              </span>
            </div>

            <div className="detail-row">
              <span className="label">Language:</span>
              <span className="value">{show.original_language.toUpperCase()}</span>
            </div>

            <div className="detail-row">
              <span className="label">Country:</span>
              <span className="value">{show.origin_country.join(', ')}</span>
            </div>

            <div className="detail-section">
              <h3>Synopsis</h3>
              <p>{show.overview || 'No overview available.'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
