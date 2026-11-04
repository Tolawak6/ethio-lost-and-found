import { useCallback, useEffect, useState } from 'react';
import { api, staffKey } from '../api';
import { useToast } from '../context/ToastContext';
import ItemForm from './ItemForm';
import { formatDate, formatDateTime, statusMeta } from '../utils';

/**
 * Department workspace: sign in with the staff key, add items to the register,
 * and review claims filed by passengers.
 */
function StaffPanel({ categories, agencies, onClose, onChanged }) {
  const toast = useToast();
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openClaimsFor, setOpenClaimsFor] = useState(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !adding && !editing && !openClaimsFor) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, adding, editing, openClaimsFor]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await api.staffItems({ limit: 50 });
      setItems(payload.items);
      setAuthed(true);
    } catch (err) {
      if (err.status === 401) {
        setAuthed(false);
      } else {
        toast.error(err.message || 'Could not load the register');
      }
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [toast]);

  useEffect(() => {
    // Try a stored key first; the sign-in form shows if there isn't one.
    if (staffKey.get()) loadItems();
    else setChecking(false);
  }, [loadItems]);

  const signIn = async (event) => {
    event.preventDefault();
    if (!keyInput.trim()) return;
    setSigningIn(true);
    staffKey.set(keyInput.trim());
    const ok = await api.checkStaffKey();
    if (ok) {
      setKeyInput('');
      await loadItems();
    } else {
      staffKey.clear();
      toast.error('That department key was not accepted');
      setSigningIn(false);
    }
  };

  const signOut = () => {
    staffKey.clear();
    setAuthed(false);
    setItems([]);
  };

  const createItem = async (formData) => {
    setSubmitting(true);
    try {
      await api.createItem(formData);
      toast.success('Item added to the register');
      setAdding(false);
      await loadItems();
      onChanged();
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
      await loadItems();
      onChanged();
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
      await loadItems();
      onChanged();
    } catch (err) {
      toast.error(err.message || 'Could not change the status');
    }
  };

  const removeItem = async (item) => {
    try {
      await api.deleteItem(item._id);
      toast.success('Item deleted');
      await loadItems();
      onChanged();
    } catch (err) {
      toast.error(err.message || 'Could not delete the item');
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Department workspace" onMouseDown={onClose}>
      <div
        className="modal__panel modal__panel--wide"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="staff">
          <header className="staff__head">
            <div>
              <h2>Department workspace</h2>
              <p>Publish found items and review passenger claims.</p>
            </div>
            {authed && (
              <button type="button" className="button button--ghost button--sm" onClick={signOut}>
                Sign out
              </button>
            )}
          </header>

          {checking && <p className="staff__muted">Checking your session…</p>}

          {!checking && !authed && (
            <form className="form staff__signin" onSubmit={signIn}>
              <label className="field">
                <span>Department key</span>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder="Ask your supervisor for the key"
                  autoFocus
                  autoComplete="current-password"
                />
                <em className="field__hint">
                  The key is stored only in this browser. Contact the lost property office if you do
                  not have one.
                </em>
              </label>
              <div className="form__actions">
                <button type="button" className="button button--ghost" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="button button--primary" disabled={signingIn || !keyInput.trim()}>
                  {signingIn ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
            </form>
          )}

          {authed && (
            <>
              <div className="staff__toolbar">
                <button type="button" className="button button--primary button--sm" onClick={() => setAdding(true)}>
                  + Add found item
                </button>
                <button type="button" className="button button--ghost button--sm" onClick={loadItems} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {items.length === 0 && !loading && (
                <p className="staff__muted">No items in the register yet. Add the first one above.</p>
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
                          {item.route || item.agency} · found {formatDate(item.foundAt)}
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
                        <button
                          type="button"
                          className="button button--danger button--sm"
                          onClick={() => removeItem(item)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {(adding || editing) && (
          <div className="staff__drawer">
            <div className="staff__drawer-head">
              <h3>{editing ? 'Edit item' : 'Add a found item'}</h3>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                }}
              >
                Cancel
              </button>
            </div>
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
        )}

        {openClaimsFor && (
          <ClaimsDrawer
            item={openClaimsFor}
            onClose={() => setOpenClaimsFor(null)}
            onChanged={async () => {
              await loadItems();
              onChanged();
            }}
          />
        )}
      </div>
    </div>
  );
}

const firstError = (err) => {
  if (err?.fields && Object.keys(err.fields).length) return Object.values(err.fields)[0];
  return err?.message;
};

/** Claims filed for one item, with approve / reject / collected actions. */
function ClaimsDrawer({ item, onClose, onChanged }) {
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
    <div className="staff__drawer">
      <div className="staff__drawer-head">
        <h3>Claims for “{item.itemName}”</h3>
        <button type="button" className="link-button" onClick={onClose}>
          Close
        </button>
      </div>

      {loading && <p className="staff__muted">Loading claims…</p>}
      {!loading && claims.length === 0 && <p className="staff__muted">No claims filed for this item yet.</p>}

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
  );
}

export default StaffPanel;
