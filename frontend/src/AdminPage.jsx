import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useToast } from './context/ToastContext';
import AdminSignIn from './components/AdminSignIn';
import DepartmentWorkspace from './components/DepartmentWorkspace';

/**
 * Hidden department area at /admin.
 *
 * There is no link to this page from the public site — it is reached by typing
 * the URL. Access is still enforced by the API on every request, so hiding it
 * is convenience rather than security.
 */
export default function AdminPage({ categories, agencies }) {
  const toast = useToast();
  const [state, setState] = useState('checking'); // checking | signedOut | signedIn
  const [account, setAccount] = useState(null);
  const [signInError, setSignInError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const current = await api.getSession();
      if (current) {
        setAccount(current);
        setState('signedIn');
      } else {
        setState('signedOut');
      }
    } catch {
      setState('signedOut');
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const signIn = async ({ email, password }) => {
    setSubmitting(true);
    setSignInError('');
    try {
      const payload = await api.signIn({ email, password });
      setAccount(payload.account);
      setState('signedIn');
    } catch (err) {
      setSignInError(
        err.status === 401
          ? 'Email or password is incorrect.'
          : err.status === 429
          ? 'Too many attempts. Please wait a few minutes.'
          : err.message || 'Could not sign in.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** `expired` distinguishes a lost session from a deliberate sign-out. */
  const signOut = async (expired) => {
    await api.signOut();
    setAccount(null);
    setState('signedOut');
    if (expired) toast.info('Your session ended — please sign in again.');
  };

  if (state === 'checking') {
    return (
      <div className="auth">
        <p className="auth__checking">Checking your session…</p>
      </div>
    );
  }

  if (state === 'signedOut') {
    return <AdminSignIn onSignIn={signIn} submitting={submitting} error={signInError} />;
  }

  return (
    <DepartmentWorkspace
      account={account}
      categories={categories}
      agencies={agencies}
      onSignOut={signOut}
      onPublicChanged={() => {}}
    />
  );
}
