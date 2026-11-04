import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import ItemForm from './ItemForm';
import AccountsPanel from './AccountsPanel';
import AuditTrail from './AuditTrail';
import { formatDate, formatDateTime, statusMeta } from '../utils';

/**
 * Signed-in department workspace at /admin.
 * Tabs: the register (publish/edit/return items), claims, accounts, and the
 * audit trail of who did what.
 */
function DepartmentWorkspace({ account, categories, agencies, onSignOut, onSessionError, onPublicChanged }) {
  const toast = useToast();
  const [tab, setTab] = useState('register');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openClaimsFor, setOpenClaimsFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.staffItems({ limit: 50 });
      setItems(payload.items);
    } catch (err) {
      // Only a genuine auth failure ends the session; anything else is a
      // retryable problem and must not sign the user out.
      if (api.isSessionError(err)) onSessionError(err);
      else toast.error(err.message || 'Could not load the register');
    } finally {
      setLoading(false);
    }
  }, [onSessionError, toast]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const afterChange = async () => {
    await loadItems();
    onPublicChanged();
  };

  const createItem = async (formData) => {
    setSubmitting(true);
    try {
      await api.createItem(formData);
      toast.success('Item added to the register');
      setAdding(false);
      await afterChange();
    } catch (err) {
      toast.error(firstError(err) || 'Could not add the item');
    } finally {
      setSubmitting(false);
    }
  };

  const updateItem = async (formData) => {
    setSubmitting(true);
    try {
      await api.updateItem(editing._id, formData);
      toast.success('Item updated');
      setEditing(null);
      await afterChange();
    } catch (err) {
      toast.error(firstError(err) || 'Could not update the item');
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (item, status) => {
    try {
      await api.setStatus(item._id, status);
      toast.success(`Marked as ${statusMeta(status).label.toLowerCase()}`);
      await afterChange();
    } catch (err) {
      toast.error(err.message || 'Could not change the status');
    }
  };

  const removeItem = async (item) => {
    try {
      await api.deleteItem(item._id);
      toast.success('Item deleted');
      await afterChange();
    } catch (err) {
      toast.error(err.message || 'Could not delete the item');
    }
  };

  const pendingTotal = items.reduce((sum, item) => sum + (item.pendingClaims || 0), 0);

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="admin__identity">
          <span className="brand__mark brand__mark--dark" aria-hidden="true">⌖</span>
          <div>
            <p className="admin__title">Department workspace</p>
            <p className="admin__who">
              {account.name}
              {account.depot ? ` · ${account.depot} depot` : ''} · {account.role}
            </p>
          </div>
        </div>
        <div className="admin__bar-actions">
          <a className="link-button" href="/" target="_blank" rel="noreferrer">
            View public register ↗
          </a>
          <button type="button" className="button button--ghost button--sm" onClick={() => onSignOut()}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Workspace sections">
        {[
          { id: 'register', label: 'Register', badge: items.length },
          { id: 'claims', label: 'Claims', badge: pendingTotal },
          { id: 'accounts', label: 'Accounts' },
          { id: 'audit', label: 'Activity' },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`tabs__tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.badge > 0 && <span className="tabs__badge">{entry.badge}</span>}
          </button>
        ))}
      </nav>

      <main className="admin__main">
        {tab === 'register' && (
          <section className="admin__section">
            <div className="admin__section-head">
              <div>
                <h2>Lost property register</h2>
                <p>{items.length} items · {pendingTotal} pending claims</p>
              </div>
              <div className="admin__section-actions">
                <button type="button" className="button button--ghost button--sm" onClick={loadItems} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button type="button" className="button button--primary button--sm" onClick={() => setAdding(true)}>
                  + Add found item
                </button>
              </div>
            </div>

            {loading && items.length === 0 && <p className="admin__muted">Loading the register…</p>}
            {!loading && items.length === 0 && (
              <p className="admin__muted">No items yet. Add the first one to open the register.</p>
            )}

            <ul className="staff__list">
              {items.map((item) => {
                const status = statusMeta(item.status);
                return (
                  <li key={item._id} className="staff__row">
                    <div className="staff__row-main">
                      <div className="staff__row-title">
                        <strong>{item.itemName}</strong>
                        <span className="mono staff__plate">{item.plateNumber}</span>
                        <span className={`badge badge--${status.tone}`}>{status.label}</span>
                        {item.pendingClaims > 0 && (
                          <span className="badge badge--pending">{item.pendingClaims} claim(s)</span>
                        )}
                      </div>
                      <p className="staff__row-meta">
                        {item.depot ? `${item.depot} depot · ` : ''}
                        {item.route || item.agency} · found {formatDate(item.foundAt)} ·{' '}
                        {item.storageOffice || 'no office set'}
                      </p>
                      {item.identifyingDetails && (
                        <p className="staff__row-private">
                          <span>Private:</span> {item.identifyingDetails}
                        </p>
                      )}
                    </div>
                    <div className="staff__row-actions">
                      <button
                        type="button"
                        className="button button--ghost button--sm"
                        onClick={() => setOpenClaimsFor(item)}
                      >
                        Claims{item.pendingClaims > 0 ? ` (${item.pendingClaims})` : ''}
                      </button>
                      <button
                        type="button"
                        className="button button--ghost button--sm"
                        onClick={() => setHistoryFor(item)}
                      >
                        History
                      </button>
                      <button type="button" className="button button--ghost button--sm" onClick={() => setEditing(item)}>
                        Edit
                      </button>
                      {item.status !== 'Returned' && (
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          onClick={() => changeStatus(item, 'Returned')}
                        >
                          Returned
                        </button>
                      )}
                      <button type="button" className="button button--danger button--sm" onClick={() => removeItem(item)}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {tab === 'claims' && (
          <section className="admin__section">
            <div className="admin__section-head">
              <div>
                <h2>Claims</h2>
                <p>Choose an item to review the claims filed for it.</p>
              </div>
            </div>

            {items.filter((item) => item.pendingClaims > 0).length === 0 && (
              <p className="admin__muted">No claims are waiting for review.</p>
            )}

            <ul className="staff__list">
              {items
                .filter((item) => item.pendingClaims > 0)
                .map((item) => (
                  <li key={item._id} className="staff__row">
                    <div className="staff__row-main">
                      <div className="staff__row-title">
                        <strong>{item.itemName}</strong>
                        <span className="mono staff__plate">{item.plateNumber}</span>
                        <span className="badge badge--pending">{item.pendingClaims} pending</span>
                      </div>
                      <p className="staff__row-meta">Found {formatDate(item.foundAt)}</p>
                    </div>
                    <div className="staff__row-actions">
                      <button
                        type="button"
                        className="button button--primary button--sm"
                        onClick={() => setOpenClaimsFor(item)}
                      >
                        Review claims
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {tab === 'accounts' && <AccountsPanel account={account} onSessionLost={onSessionError} />}
        {tab === 'audit' && <AuditTrail onSessionError={onSessionError} />}
      </main>

      {(adding || editing) && (
        <div className="modal" role="dialog" aria-modal="true" onMouseDown={() => {
          setAdding(false);
          setEditing(null);
        }}>
          <div className="modal__panel modal__panel--form" onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal__close"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="modal__title">{editing ? 'Edit item' : 'Add a found item'}</h2>
            <ItemForm
              categories={categories}
              agencies={agencies}
              initialItem={editing}
              submitting={submitting}
              onSubmit={editing ? updateItem : createItem}
              onCancel={() => {
                setAdding(false);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}

      {historyFor && (
        <AuditTrail item={historyFor} onClose={() => setHistoryFor(null)} onSessionError={onSessionError} />
      )}

      {openClaimsFor && (
        <ClaimsModal
          item={openClaimsFor}
          onClose={() => setOpenClaimsFor(null)}
          onChanged={afterChange}
        />
      )}
    </div>
  );
}

const firstError = (err) => {
  if (err?.fields && Object.keys(err.fields).length) return Object.values(err.fields)[0];
  return err?.message;
};

/** Claims filed for one item, with approve / reject / collected actions. */
function ClaimsModal({ item, onClose, onChanged }) {
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.staffItemClaims(item._id);
      setClaims(payload.claims);
    } catch (err) {
      toast.error(err.message || 'Could not load claims');
    } finally {
      setLoading(false);
    }
  }, [item._id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const review = async (claim, status) => {
    try {
      await api.reviewClaim(claim._id, status, notes[claim._id] || undefined);
      toast.success(`Claim ${status.toLowerCase()}`);
      await load();
      await onChanged();
    } catch (err) {
      toast.error(err.message || 'Could not update the claim');
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Claims for ${item.itemName}`} onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="admin__section">
          <div className="admin__section-head">
            <div>
              <h2>Claims for “{item.itemName}”</h2>
              <p>
                {item.plateNumber} · found {formatDate(item.foundAt)}
              </p>
            </div>
          </div>

          {loading && <p className="admin__muted">Loading claims…</p>}
          {!loading && claims.length === 0 && <p className="admin__muted">No claims filed for this item yet.</p>}

          <ul className="claims">
            {claims.map((claim) => {
              const tone =
                claim.status === 'Approved' || claim.status === 'Collected'
                  ? 'returned'
                  : claim.status === 'Rejected'
                  ? 'disposed'
                  : 'pending';
              return (
                <li key={claim._id} className="claims__row">
                  <div className="claims__head">
                    <strong>{claim.claimantName}</strong>
                    <span className={`badge badge--${tone}`}>{claim.status}</span>
                    <span className="mono claims__ref">{claim.reference}</span>
                  </div>
                  <p className="claims__contact">
                    {claim.phone}
                    {claim.email ? ` · ${claim.email}` : ''} · submitted {formatDateTime(claim.createdAt)}
                  </p>
                  <blockquote className="claims__proof">{claim.proof}</blockquote>

                  {claim.status === 'Pending' && (
                    <>
                      <label className="field">
                        <span>Review note (optional)</span>
                        <input
                          value={notes[claim._id] || ''}
                          onChange={(event) =>
                            setNotes((current) => ({ ...current, [claim._id]: event.target.value }))
                          }
                          placeholder="e.g. ID checked, matches description"
                          maxLength={500}
                        />
                      </label>
                      <div className="claims__actions">
                        <button type="button" className="button button--primary button--sm" onClick={() => review(claim, 'Approved')}>
                          Approve
                        </button>
                        <button type="button" className="button button--ghost button--sm" onClick={() => review(claim, 'Collected')}>
                          Mark collected
                        </button>
                        <button type="button" className="button button--danger button--sm" onClick={() => review(claim, 'Rejected')}>
                          Reject
                        </button>
                      </div>
                    </>
                  )}

                  {claim.status !== 'Pending' && claim.reviewNote && (
                    <p className="claims__note">Note: {claim.reviewNote}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DepartmentWorkspace;
