import { useState } from 'react';

function AdminSignIn({ onSignIn, submitting, error, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    onSignIn({ email: email.trim(), password });
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="brand__mark brand__mark--dark" aria-hidden="true">⌖</span>
          <div>
            <p className="auth__title">Department sign-in</p>
            <p className="auth__subtitle">Ethio Lost &amp; Found · staff only</p>
          </div>
        </div>

        {notice && <p className="auth__notice">{notice}</p>}

        <form className="form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Work email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@depot.et"
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="auth__password">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="link-button"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error && <p className="field__error field__error--block">{error}</p>}

          <button type="submit" className="button button--primary button--block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth__hint">
          Accounts are created by a department manager. If you cannot sign in, contact the lost
          property office supervisor.
        </p>
        <a className="link-button auth__back" href="/">
          ← Back to the public register
        </a>
      </div>
    </div>
  );
}

export default AdminSignIn;
