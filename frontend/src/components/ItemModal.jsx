import { useEffect, useState } from 'react';
import { formatDate, formatDateTime, imageSrc, statusMeta, daysUntil, timeAgo } from '../utils';
import ClaimForm from './ClaimForm';

function ItemModal({ item, onClose, onClaim, submitting, initialClaim = false }) {
  const [view, setView] = useState(initialClaim ? 'claim' : 'details');
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    setView(initialClaim ? 'claim' : 'details');
  }, [initialClaim, item?._id]);

  if (!item) return null;

  const status = statusMeta(item.status);
  const image = imageSrc(item.imageUrl);
  const daysLeft = daysUntil(item.storageDeadline);
  const claimable = item.status !== 'Returned' && item.status !== 'Disposed';

  const submitClaim = async (claim) => {
    const result = await onClaim(item, claim);
    if (result) setConfirmation(result);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={item.itemName} onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {confirmation ? (
          <div className="confirmation">
            <div className="confirmation__mark" aria-hidden="true">✓</div>
            <h2>Claim submitted</h2>
            <p>{confirmation.message}</p>
            <div className="confirmation__reference">
              <span>Your reference</span>
              <strong>{confirmation.claim.reference}</strong>
            </div>
            <p className="confirmation__hint">
              Write this down. You can check its status any time with the “Track a claim” button,
              and the office will call you on the number you gave.
            </p>
            <div className="confirmation__actions">
              <button type="button" className="button button--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : view === 'claim' ? (
          <div className="modal__body">
            <button type="button" className="link-button" onClick={() => setView('details')}>
              ← Back to the item
            </button>
            <ClaimForm item={item} onSubmit={submitClaim} onCancel={() => setView('details')} submitting={submitting} />
          </div>
        ) : (
          <>
            {image ? (
              <img className="modal__image" src={image} alt={item.itemName} />
            ) : (
              <div className="modal__image modal__image--placeholder">{item.category}</div>
            )}

            <div className="modal__body">
              <div className="modal__badges">
                <span className="badge badge--plate badge--static">{item.plateNumber}</span>
                <span className={`badge badge--status badge--static badge--${status.tone}`}>
                  {status.label}
                </span>
                <span className="badge badge--soft">{item.category}</span>
              </div>

              <h2>{item.itemName}</h2>
              <p className="modal__timestamp">
                Handed in {timeAgo(item.foundAt)} · {formatDate(item.foundAt)}
              </p>
              <p className="modal__description">{item.description}</p>

              <h3 className="modal__subtitle">Where it was found</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Bus plate number</dt>
                  <dd className="mono">{item.plateNumber}</dd>
                </div>
                <div>
                  <dt>Bus code</dt>
                  <dd>{item.busCode || '—'}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>{item.route || '—'}</dd>
                </div>
                <div>
                  <dt>Agency</dt>
                  <dd>{item.agency}</dd>
                </div>
                <div>
                  <dt>On board</dt>
                  <dd>{item.foundOnBoard || '—'}</dd>
                </div>
                <div>
                  <dt>Reported by</dt>
                  <dd>{item.reportedBy || 'Bus supervisor'}</dd>
                </div>
              </dl>

              <h3 className="modal__subtitle">Where to collect it</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Storage office</dt>
                  <dd>{item.storageOffice || 'Lost Property Office'}</dd>
                </div>
                <div>
                  <dt>Held until</dt>
                  <dd>
                    {formatDate(item.storageDeadline)}
                    {daysLeft !== null && daysLeft >= 0 && (
                      <em className="detail-grid__note"> ({daysLeft} days left)</em>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd className="mono">#{String(item._id || '').slice(-6).toUpperCase()}</dd>
                </div>
              </dl>

              <div className="modal__hint">
                Bring an ID and be ready to describe the item in detail. Staff will only hand it over
                when they are satisfied it is yours.
              </div>

              <div className="modal__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setView('claim')}
                  disabled={!claimable}
                >
                  {claimable ? 'This is mine — file a claim' : 'No longer available'}
                </button>
                <button type="button" className="button button--ghost" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ItemModal;
