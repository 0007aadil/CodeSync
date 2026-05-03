import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AuthModal({ onClose, onAuth, initialTab = 'login' }) {
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = tab === 'login'
      ? { email, password }
      : { email, username, password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      // Auth context handles localStorage persistence
      onAuth(data.user, data.token);
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="url(#alg)" />
              <path d="M7 8h10M7 12h6M7 16h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <defs><linearGradient id="alg" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#ff6363" /><stop offset="1" stopColor="#ffb347" /></linearGradient></defs>
            </svg>
            <span>CodeSync</span>
          </div>
          <p className="auth-subtitle">
            {tab === 'login' ? 'Sign in to save your files online' : 'Create an account to get started'}
          </p>
          <button className="auth-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            Sign In
          </button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          {tab === 'register' && (
            <label className="auth-label">
              Username
              <input
                type="text"
                className="auth-input"
                placeholder="Your display name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                maxLength={50}
              />
            </label>
          )}

          <label className="auth-label">
            Password
            <input
              type="password"
              className="auth-input"
              placeholder={tab === 'register' ? 'At least 6 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={tab === 'register' ? 6 : 1}
            />
          </label>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <><div className="auth-spinner" /> {tab === 'login' ? 'Signing in...' : 'Creating account...'}</>
            ) : (
              tab === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div className="auth-footer">
          {tab === 'login' ? (
            <span>Don't have an account? <button className="auth-link" onClick={() => { setTab('register'); setError(''); }}>Sign Up</button></span>
          ) : (
            <span>Already have an account? <button className="auth-link" onClick={() => { setTab('login'); setError(''); }}>Sign In</button></span>
          )}
        </div>
      </div>
    </div>
  );
}
