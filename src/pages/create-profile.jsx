import { useState } from 'react';
import { useAuth } from '../context/auth-context';

const AVATARS = ['🧑', '👩', '🧔', '👨‍💼', '👩‍💼', '🧑‍🎨', '🧑‍💻', '🦊', '🐼', '🐨'];

export default function CreateProfile() {
  const { createProfile } = useAuth();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createProfile({ name: name.trim(), avatar });
    } catch (err) {
      console.error('Failed to create profile:', err);
      setError('Could not save your profile. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-mark">S</div>
        <h1>Set up your profile</h1>
        <p className="field-hint" style={{ marginBottom: 20 }}>
          Just for you — this is how you'll show up inside Social Manager.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label>Your name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha" />
          </div>
          <div className="field">
            <label>Pick an avatar</label>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a}
                  className={`avatar-choice ${avatar === a ? 'avatar-choice-active' : ''}`}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="field-error" style={{ marginBottom: 14 }}>{error}</div>}
          <button className="btn btn-accent btn-block" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
