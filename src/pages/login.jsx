import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { firebaseReady } from '../config/firebase.js';

export default function Login() {
  const { login, signup, blocked, ownerConfigured } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!firebaseReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card card">
          <div className="auth-mark">S</div>
          <h1>Social Manager needs Firebase</h1>
          <p className="field-hint" style={{ marginTop: 8, lineHeight: 1.6 }}>
            This app uses Firebase for login and storage — free on the Spark plan. Create a project at{' '}
            <strong>console.firebase.google.com</strong>, enable <strong>Authentication → Email/Password</strong> and{' '}
            <strong>Firestore Database</strong>, then paste your web app config into{' '}
            <code className="mono">src/config/firebase-config.js</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!ownerConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card card">
          <div className="auth-mark">S</div>
          <h1>This app isn't locked down yet</h1>
          <p className="field-hint" style={{ marginTop: 8, lineHeight: 1.6 }}>
            Set <code className="mono">OWNER_EMAIL</code> in <code className="mono">src/config/owner-config.js</code> to
            your own email before deploying — until then, anyone could sign up and use it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-mark">S</div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="field-hint" style={{ marginBottom: 20 }}>
          One login, every page you run. This app is private to one account.
        </p>

        {blocked && (
          <div className="field-error" style={{ marginBottom: 14 }}>
            That account isn't authorized for this app.
          </div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          {error && <div className="field-error" style={{ marginBottom: 14 }}>{error}</div>}
          <button className="btn btn-accent btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('email-already-in-use')) return 'That email is already registered — try logging in instead.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Email or password is incorrect.';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  return err?.message || 'Something went wrong. Please try again.';
}
