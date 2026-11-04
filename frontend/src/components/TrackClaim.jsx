import { useEffect, useState } from 'react';
import { api } from '../api';
import { claimStatusMeta, formatDateTime } from '../utils';

function TrackClaim({ onClose }) {
  const [reference, setReference] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const lookup = async (event) => {
    event.preventDefault();
    const code = reference.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.getClaimStatus(code));
    } catch (err) {
      setError(
        err.status === 404
          ? 'No claim found with that reference. Check the code on your confirmation and try again.'
          : err.message || 'Could not look up that claim'
      );
    } finally {
      setLoading(false);
    }
  };

  const meta = result ? claimStatusMeta(result.status) : null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Track a claim" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--form" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="modal__title">Track a claim</h2>
        <p className="modal__lead">
          Enter the reference you received when you submitted your claim (it looks like
          <strong> EC-7Q2X9P</strong>).
        </p>

        <form className="form" onSubmit={lookup}>
          <label className="field">
            <span>Claim reference</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="EC-XXXXXX"
              autoFocus
              maxLength={20}
            />
          </label>
          <div className="form__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={loading || !reference.trim()}>
              {loading ? 'Checking…' : 'Check status'}
            </button>
          </div>
        </form>

        {error && <p className="field__error field__error--block">{error}</p>}

        {result && (
          <div className={`claim-status claim-status--${meta.tone}`}>
            <span className={`badge badge--${meta.tone}`}>{meta.label}</span>
            <dl className="detail-grid">
              <div>
                <dt>Reference</dt>
                <dd className="mono">{result.reference}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(result.submittedAt)}</dd>
              </div>
              {result.item && (
                <>
                  <div>
                    <dt>Item</dt>
                    <dd>{result.item.itemName}</dd>
                  </div>
                  <div>
                    <dt>Bus plate</dt>
                    <dd className="mono">{result.item.plateNumber}</dd>
                  </div>
                  <div>
                    <dt>Collect from</dt>
                    <dd>{result.item.storageOffice || 'Lost Property Office'}</dd>
                  </div>
                </>
              )}
            </dl>
            {result.status === 'Approved' && (
              <p className="claim-status__note">
                Bring your ID to the office and quote this reference. Items are kept for 90 days.
              </p>
            )}
            {result.status === 'Rejected' && (
              <p className="claim-status__note">
                The department could not confirm ownership. You can visit the office in person with
                more evidence.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrackClaim;
