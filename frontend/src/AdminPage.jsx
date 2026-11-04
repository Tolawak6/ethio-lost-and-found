import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useToast } from './context/ToastContext';
import AdminSignIn from './components/AdminSignIn';
import DepartmentWorkspace from './components/DepartmentWorkspace';

/** Minutes of inactivity before we warn that the session is about to end. */
const IDLE_WARN_MINUTES = 20;

/**
 * Hidden department area at /admin.
 *
 * There is no link to this page from the public site — it is reached by typing
 * the URL. Access is still enforced by the API on every request, so hiding the
 * page is convenience rather than security.
 */
export default function AdminPage({ categories, agencies }) {
  const toast = useToast();
  const [state, setState] = useState('checking'); // checking | signedOut | signedIn
  const [account, setAccount] = useState(null);
  const [signInError, setSignInError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Guards against a second 401 firing "session ended" (StrictMode, parallel calls).
  const endingSession = useRef(false);

  /** Leaves the workspace exactly once, with a message that matches the cause. */
  const signOut = useCallback(
    async ({ expired = false, message } = {}) => {
      if (endingSession.current) return;
      endingSession.current = true;
      try {
        await api.signOut();
        setAccount(null);
        setState('signedOut');
        if (message) toast.info(message);
        else if (expired) toast.info('Your session ended. Please sign in again.');
      } finally {
        endingSession.current = false;
      }
    },
    [toast]
  );

  const handleSessionError = useCallback(
    (err) => {
      if (endingSession.current) return;
      const missing = err?.code === 'account_missing';
      const disabled = err?.code === 'account_disabled';
      signOut({
        expired: true,
        message: missing
          ? 'This session is no longer valid — please sign in again.'
          : disabled
          ? 'This account has been disabled. Contact a department manager.'
          : 'Your session ended. Please sign in again.',
      });
    },
    [signOut]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await api.getSession();
        if (cancelled) return;
        if (current) {
          setAccount(current);
          setState('signedIn');
        } else {
          setState('signedOut');
        }
      } catch {
        // A network or server problem is not proof the session is invalid;
        // send the user to the sign-in form without wiping anything.
        if (!cancelled) setState((previous) => (previous === 'signedIn' ? previous : 'signedOut'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
          : err.status === 503
          ? 'The service is unavailable right now. Try again shortly.'
          : err.message || 'Could not sign in.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Warn before the 12-hour token runs out so nobody loses work mid-edit.
  useEffect(() => {
    if (state !== 'signedIn') return undefined;

    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        toast.info(
          `You have been inactive for ${IDLE_WARN_MINUTES} minutes. Sign in again before saving if this page has been idle for a long time.`
        );
      }, IDLE_WARN_MINUTES * 60 * 1000);
    };

    const events = ['click', 'keydown', 'mousemove', 'touchstart'];
    events.forEach((event) => document.addEventListener(event, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((event) => document.removeEventListener(event, reset));
    };
  }, [state, toast]);

  if (state === 'checking') {
    return (
      <div className="auth">
        <div className="auth__checking" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Checking your session…</p>
          <p className="auth__checking-hint">This only takes a moment.</p>
        </div>
      </div>
    );
  }

  if (state === 'signedOut') {
    return (
      <AdminSignIn
        onSignIn={signIn}
        submitting={submitting}
        error={signInError}
        notice={null}
      />
    );
  }

  return (
    <DepartmentWorkspace
      account={account}
      categories={categories}
      agencies={agencies}
      onSignOut={() => signOut({})}
      onSessionError={handleSessionError}
      onPublicChanged={() => {}}
    />
  );
}
