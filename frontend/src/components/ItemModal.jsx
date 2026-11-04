import { useEffect, useState } from 'react';
import { imageSrc, formatDate, timeAgo } from '../utils';

function ItemModal({ item, onClose, onToggleStatus, onDelete, onEdit }) {
  const [confirming, setConfirming] = useState(false);

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

  if (!item) return null;

  const claimed = item.status === 'Claimed';
  const image = imageSrc(item.imageUrl);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={item.itemName} onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {image ? (
          <img className="modal__image" src={image} alt={item.itemName} />
        ) : (
          <div className="modal__image modal__image--placeholder">{item.category}</div>
        )}

        <div className="modal__body">
          <div className="modal__badges">
            <span className={`badge badge--type badge--${item.type?.toLowerCase()}`}>{item.type || 'Found'}</span>
            <span className={`badge ${claimed ? 'badge--claimed' : 'badge--open'}`}>
              {claimed ? 'Claimed' : 'Open'}
            </span>
            <span className="badge badge--soft">{item.category}</span>
          </div>

          <h2>{item.itemName}</h2>
          <p className="modal__timestamp">
            Reported {timeAgo(item.createdAt)} · {formatDate(item.date || item.createdAt)}
          </p>
          <p className="modal__description">{item.description}</p>

          <dl className="detail-grid">
            <div>
              <dt>Location</dt>
              <dd>{item.location}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd className="mono">#{String(item._id || '').slice(-6).toUpperCase()}</dd>
            </div>
            {item.contactName && (
              <div>
                <dt>Contact</dt>
                <dd>{item.contactName}</dd>
              </div>
            )}
            {item.contactPhone && (
              <div>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${item.contactPhone}`}>{item.contactPhone}</a>
                </dd>
              </div>
            )}
            {item.contactEmail && (
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${item.contactEmail}`}>{item.contactEmail}</a>
                </dd>
              </div>
            )}
          </dl>

          <div className="modal__hint">
            When you contact someone about an item, ask for details that are not shown here to make sure it belongs to them.
          </div>

          <div className="modal__actions">
            <button
              type="button"
              className={`button ${claimed ? 'button--ghost' : 'button--primary'}`}
              onClick={() => onToggleStatus(item)}
            >
              {claimed ? 'Reopen as unclaimed' : 'Mark as claimed'}
            </button>
            {onEdit && (
              <button type="button" className="button button--ghost" onClick={() => onEdit(item)}>
                Edit
              </button>
            )}
            {confirming ? (
              <span className="confirm-inline">
                <span>Delete permanently?</span>
                <button type="button" className="button button--danger button--sm" onClick={() => onDelete(item)}>
                  Yes, delete
                </button>
                <button type="button" className="button button--ghost button--sm" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="button button--ghost" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ItemModal;
