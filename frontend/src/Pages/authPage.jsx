import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../Auth/authContext.jsx';
export default function AuthPage({ mode }) {
  const { user, authenticate } = useAuth();
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const register = mode === 'register';
  if (user) return <Navigate to="/" replace />;
  function field(key) { return { value: fields[key], onChange: event => setFields(previous => ({ ...previous, [key]: event.target.value })) }; }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await authenticate(mode, fields); const from = location.state?.from; navigate(from ? `${from.pathname}${from.search || ''}` : '/', { replace: true }); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="card form-card auth-card"><span className="eyebrow">YOU BELONG HERE</span><h1>{register ? 'Join the conversation.' : 'Welcome back.'}</h1><p>{register ? 'Create an account to share, ask, and connect.' : 'Your community is a sign-in away.'}</p><form onSubmit={submit}>{register && <label>Your name<input {...field('name')} autoComplete="name" required minLength={2} maxLength={60} /></label>}<label>Email<input {...field('email')} type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input {...field('password')} type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 1} maxLength={128} /></label>{register && <p className="meta">Use at least 8 characters.</p>}{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account ↗' : 'Sign in ↗'}</button></form><p>{register ? 'Already a member? ' : 'New here? '}<Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p></section>;
}
