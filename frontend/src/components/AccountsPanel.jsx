import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils';

const EMPTY = { name: '', email: '', password: '', depot: '', role: 'staff' };

/** Managers: add depot accounts and deactivate them. Everyone: own password. */
function AccountsPanel({ account, onSessionLost }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  const isManager = account.role === 'manager';

  const load = useCallback(async () => {
    if (!isManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await api.staffAccounts();
      setAccounts(payload.accounts);
    } catch (err) {
      if (api.isSessionError(err)) onSessionLost(err);
      else if (err.status === 403) setAccounts([]);
      else toast.error(err.message || 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }, [isManager, onSessionLost, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (event) => {
    event.preventDefault();
    const next = {};
    if (!values.name.trim()) next.name = 'Name is required';
    if (!values.email.trim()) next.email = 'Email is required';
    if (values.password.length < 8) next.password = 'Use at least 8 characters';
    setErrors(next);
    if (Object.keys(next).length) return;

    setCreating(true);
    try {
      await api.createStaffAccount({ ...values, name: values.name.trim(), email: values.email.trim() });
      toast.success('Account created');
      setValues(EMPTY);
      await load();
    } catch (err) {
      toast.error(err.fields ? Object.values(err.fields)[0] : err.message || 'Could not create the account');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (target, active) => {
    try {
      await api.setStaffActive(target._id, active);
      toast.success(active ? 'Account enabled' : 'Account disabled');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not update the account');
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.next.length < 8) {
      toast.error('Use at least 8 characters for the new password');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(passwords.current, passwords.next);
      toast.success('Password updated');
      setPasswords({ current: '', next: '' });
    } catch (err) {
      toast.error(err.fields ? Object.values(err.fields)[0] : err.message || 'Could not change the password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="admin__section">
      <div className="admin__section-head">
        <div>
          <h2>Your password</h2>
          <p>Signed in as {account.email}</p>
        </div>
      </div>

      <form className="form accounts__password" onSubmit={changePassword}>
        <div className="form__grid">
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={passwords.current}
              onChange={(event) => setPasswords((p) => ({ ...p, current: event.target.value }))}
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={passwords.next}
              onChange={(event) => setPasswords((p) => ({ ...p, next: event.target.value }))}
              autoComplete="new-password"
            />
            <em className="field__hint">At least 8 characters.</em>
          </label>
        </div>
        <div className="form__actions">
          <button
            type="submit"
            className="button button--primary button--sm"
            disabled={savingPassword || !passwords.current || !passwords.next}
          >
            {savingPassword ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>

      {isManager && (
        <>
          <div className="admin__section-head admin__section-head--spaced">
            <div>
              <h2>Department accounts</h2>
              <p>Give each depot its own sign-in so every change can be traced.</p>
            </div>
          </div>

          {loading && <p className="admin__muted">Loading accounts…</p>}

          {!loading && (
            <ul className="staff__list">
              {accounts.map((entry) => (
                <li key={entry._id} className="staff__row">
                  <div className="staff__row-main">
                    <div className="staff__row-title">
                      <strong>{entry.name}</strong>
                      <span className={`badge badge--${entry.active ? 'returned' : 'disposed'}`}>
                        {entry.active ? 'Active' : 'Disabled'}
                      </span>
                      <span className="badge badge--soft">{entry.role}</span>
                    </div>
                    <p className="staff__row-meta">
                      {entry.email}
                      {entry.depot ? ` · ${entry.depot} depot` : ' · all depots'}
                      {entry.lastLoginAt ? ` · last signed in ${formatDateTime(entry.lastLoginAt)}` : ' · never signed in'}
                    </p>
                  </div>
                  <div className="staff__row-actions">
                    {entry._id !== account._id && (
                      <button
                        type="button"
                        className={`button button--sm ${entry.active ? 'button--danger' : 'button--ghost'}`}
                        onClick={() => toggleActive(entry, !entry.active)}
                      >
                        {entry.active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form className="form accounts__create" onSubmit={create} noValidate>
            <h3>Add a department account</h3>
            <div className="form__grid">
              <label className="field">
                <span>Full name *</span>
                <input
                  value={values.name}
                  onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name && <em className="field__error">{errors.name}</em>}
              </label>
              <label className="field">
                <span>Work email *</span>
                <input
                  type="email"
                  value={values.email}
                  onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
                  placeholder="name@depot.et"
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && <em className="field__error">{errors.email}</em>}
              </label>
              <label className="field">
                <span>Temporary password *</span>
                <input
                  type="text"
                  value={values.password}
                  onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
                  aria-invalid={Boolean(errors.password)}
                />
                <em className="field__hint">Share it privately; they can change it after signing in.</em>
                {errors.password && <em className="field__error">{errors.password}</em>}
              </label>
              <label className="field">
                <span>Depot</span>
                <input
                  value={values.depot}
                  onChange={(event) => setValues((v) => ({ ...v, depot: event.target.value }))}
                  placeholder="e.g. Merkato"
                  maxLength={80}
                />
              </label>
              <label className="field">
                <span>Role</span>
                <select value={values.role} onChange={(event) => setValues((v) => ({ ...v, role: event.target.value }))}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
            </div>
            <div className="form__actions">
              <button type="submit" className="button button--primary button--sm" disabled={creating}>
                {creating ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

export default AccountsPanel;
