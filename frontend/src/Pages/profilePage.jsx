import { useState } from 'react';
import { useAuth } from '../Auth/authContext.jsx';
import { useToast } from '../Context/toastContext.jsx';
import api from '../apiClient.js';
import AvatarUploader from '../Components/avatarUploader.jsx';
import { useQueryClient } from '@tanstack/react-query';
export default function ProfilePage() {
  const { user, dispatch } = useAuth();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try { const { data } = await api.patch('/profile', { name }); dispatch({ type: 'USER_UPDATED', payload: data }); queryClient.invalidateQueries(); showToast('Profile saved.', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Your profile</h1><p className="meta">{user.email} · {user.role}</p><form onSubmit={submit}><label>Display name<input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={60} required /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save name'}</button></form><hr /><AvatarUploader /></section>;
}
