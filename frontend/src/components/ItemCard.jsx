import { formatDate, imageSrc, statusMeta, daysUntil } from '../utils';

function ItemCard({ item, onOpen }) {
  const image = imageSrc(item.imageUrl);
  const status = statusMeta(item.status);
  const daysLeft = daysUntil(item.storageDeadline);
  const closingSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

  return (
    <article className={`card card--${status.tone}`}>
      <button
        type="button"
        className="card__media"
        onClick={() => onOpen(item)}
        aria-label={`View ${item.itemName}`}
      >
        {image ? (
          <img src={image} alt={item.itemName} loading="lazy" />
        ) : (
          <div className="card__placeholder" aria-hidden="true">
            <span>{item.category}</span>
          </div>
        )}
        <span className="badge badge--plate">{item.plateNumber}</span>
        <span className={`badge badge--status badge--${status.tone}`}>{status.label}</span>
      </button>

      <div className="card__body">
        <div className="card__heading">
          <h3>{item.itemName}</h3>
          <span className="card__category">{item.category}</span>
        </div>

        <p className="card__route">
          <span aria-hidden="true">🚌</span> {item.route || item.agency}
        </p>
        <p className="card__description">{item.description}</p>

        <dl className="card__meta">
          <div>
            <dt>Found</dt>
            <dd>{formatDate(item.foundAt)}</dd>
          </div>
          <div>
            <dt>On board</dt>
            <dd>{item.foundOnBoard || '—'}</dd>
          </div>
        </dl>

        {closingSoon && (
          <p className="card__deadline">
            ⏳ Held {daysLeft === 0 ? 'until today' : `for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}`}
          </p>
        )}

        <div className="card__actions">
          <button type="button" className="button button--ghost button--sm" onClick={() => onOpen(item)}>
            Details
          </button>
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => onOpen(item, { claim: true })}
            disabled={item.status === 'Returned' || item.status === 'Disposed'}
          >
            This is mine
          </button>
        </div>
      </div>
    </article>
  );
}

export default ItemCard;
