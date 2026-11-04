import { formatDate, imageSrc } from '../utils';

function ItemCard({ item, onOpen, onToggleStatus }) {
  const image = imageSrc(item.imageUrl);
  const claimed = item.status === 'Claimed';

  return (
    <article className={`card${claimed ? ' card--claimed' : ''}`}>
      <button type="button" className="card__media" onClick={() => onOpen(item)} aria-label={`View ${item.itemName}`}>
        {image ? (
          <img src={image} alt={item.itemName} loading="lazy" />
        ) : (
          <div className="card__placeholder" aria-hidden="true">
            <span>{item.category}</span>
          </div>
        )}
        <span className={`badge badge--type badge--${item.type?.toLowerCase()}`}>{item.type || 'Found'}</span>
        <span className={`badge badge--status ${claimed ? 'badge--claimed' : 'badge--open'}`}>
          {claimed ? 'Claimed' : 'Open'}
        </span>
      </button>

      <div className="card__body">
        <div className="card__heading">
          <h3>{item.itemName}</h3>
          <span className="card__category">{item.category}</span>
        </div>
        <p className="card__description">{item.description}</p>

        <dl className="card__meta">
          <div>
            <dt>Location</dt>
            <dd>{item.location}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(item.date || item.createdAt)}</dd>
          </div>
        </dl>

        <div className="card__actions">
          <button type="button" className="button button--ghost button--sm" onClick={() => onOpen(item)}>
            Details
          </button>
          <button
            type="button"
            className={`button button--sm ${claimed ? 'button--ghost' : 'button--primary'}`}
            onClick={() => onToggleStatus(item)}
          >
            {claimed ? 'Reopen' : 'Mark claimed'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default ItemCard;
