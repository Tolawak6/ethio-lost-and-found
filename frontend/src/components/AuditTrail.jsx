import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatDateTime } from '../utils';

/**
 * The department audit trail.
 *
 * Answers the questions a lost-property office is asked after the fact: who
 * logged this item, who changed its status, who handed it back to a passenger?
 *
 * Two modes:
 *   <AuditTrail item={item} />   one item's history, shown in a modal
 *   <AuditTrail />               the whole department's recent activity
 */

const ACTION_META = {
  'item.created': { label: 'Logged item', tone: 'in' },
  'item.updated': { label: 'Edited item', tone: 'neutral' },
  'item.deleted': { label: 'Deleted item', tone: 'danger' },
  'item.returned': { label: 'Returned to passenger', tone: 'done' },
  'claim.reviewed': { label: 'Reviewed claim', tone: 'neutral' },
  'claim.collected': { label: 'Handed item over', tone: 'done' },
  'account.created': { label: 'Created account', tone: 'neutral' },
  'account.enabled': { label: 'Enabled account', tone: 'neutral' },
  'account.disabled': { label: 'Disabled account', tone: 'danger' },
  'account.password_changed': { label: 'Changed password', tone: 'neutral' },
  'session.signed_in': { label: 'Signed in', tone: 'neutral' },
};

const metaFor = (action) => ACTION_META[action] || { label: action, tone: 'neutral' };

/** A short human sentence describing what an entry changed. */
const summarise = (entry) => {
  const details = entry.details || {};
  if (entry.action === 'item.updated' && Array.isArray(details.changed) && details.changed.length) {
    return details.changed
      .map((field) => {
        const change = details[field];
        if (change && typeof change === 'object' && 'to' in change) {
          const to = change.to === null || change.to === '' ? 'empty' : change.to;
          return `${field} → ${to}`;
        }
        return field;
      })
      .join(', ');
  }
  if (entry.action === 'item.returned') {
    return details.from ? `${details.from} → ${details.to}` : 'Marked as returned';
  }
  if (entry.action === 'claim.reviewed' || entry.action === 'claim.collected') {
    return [details.from && `${details.from} → ${details.status}`, details.note]
      .filter(Boolean)
      .join(' · ');
  }
  if (entry.action === 'item.created' && details.plateNumber) {
    return `Plate ${details.plateNumber}${details.depot ? ` · ${details.depot}` : ''}`;
  }
  if (entry.action === 'item.deleted' && details.plateNumber) {
    return `Plate ${details.plateNumber} · was ${details.status || 'unknown'}`;
  }
  if (entry.action.startsWith('account.') && details.email) {
    return `${details.email}${details.role ? ` · ${details.role}` : ''}${details.depot ? ` · ${details.depot}` : ''}`;
  }
  return '';
};

export default function AuditTrail({ item = null, onClose = null, onSessionError }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = item ? await api.itemAudit(item._id, { limit: 100 }) : await api.auditTrail({ limit: 100 });
      setEntries(payload.entries || []);
    } catch (err) {
      if (api.isSessionError(err) && onSessionError) {
        onSessionError(err);
        return;
      }
      setError(err.message || 'Could not load the audit trail');
    } finally {
      setLoading(false);
    }
  }, [item, onSessionError]);

  useEffect(() => {
    load();
  }, [load]);

  const body = (
    <>
      {loading && <p className="admin__muted">Loading the trail…</p>}
      {!loading && error && <p className="form__error">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="admin__muted">
          {item ? 'Nothing has happened to this item yet.' : 'No department activity recorded yet.'}
        </p>
      )}

      {entries.length > 0 && (
        <ol className="audit">
          {entries.map((entry) => {
            const meta = metaFor(entry.action);
            const summary = summarise(entry);
            return (
              <li key={entry._id} className="audit__row">
                <span className={`audit__dot audit__dot--${meta.tone}`} aria-hidden="true" />
                <div className="audit__body">
                  <p className="audit__head">
                    <strong>{meta.label}</strong>
                    {entry.entityLabel && <span className="audit__label">{entry.entityLabel}</span>}
                  </p>
                  <p className="audit__meta">
                    {entry.actorName || 'Unknown account'}
                    {entry.actorDepot ? ` · ${entry.actorDepot}` : ''} · {formatDateTime(entry.createdAt)}
                  </p>
                  {summary && <p className="audit__detail">{summary}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  if (!item) {
    return (
      <section className="admin__section">
        <div className="admin__section-head">
          <div>
            <h2>Activity log</h2>
            <p>Who logged, edited or handed back each item.</p>
          </div>
          <div className="admin__section-actions">
            <button type="button" className="button button--ghost button--sm" onClick={load} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {body}
      </section>
    );
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="audit-title" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--form" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="modal__title" id="audit-title">
          {item.itemName}
        </h2>
        <p className="admin__muted audit__subtitle">
          History · plate <span className="mono">{item.plateNumber}</span>
        </p>
        {body}
      </div>
    </div>
  );
}
