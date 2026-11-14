import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../apiClient.js';
import { useToast } from '../Context/toastContext.jsx';

export default function CreateThreadForm() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: async () => (await api.post('/threads', { title: title.trim(), content: content.trim() })).data,
    onSuccess: thread => { queryClient.invalidateQueries({ queryKey: ['threads'] }); showToast('Discussion published.', 'success'); navigate(`/threads/${thread.id}`); },
    onError: error => showToast(error.message, 'error'),
  });
  return <section className="card form-card"><span className="eyebrow">SHARE AN IDEA</span><h1>Start a discussion</h1><p>Give your community something to think about.</p><form onSubmit={event => { event.preventDefault(); if (title.trim() && content.trim()) mutation.mutate(); else showToast('Please fill in both fields.', 'error'); }}><label>Title<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={150} placeholder="What’s on your mind?" /></label><label>Your discussion<textarea value={content} onChange={event => setContent(event.target.value)} required maxLength={10000} rows={8} placeholder="Add context, share an idea, or ask a question…" /></label><button disabled={mutation.isPending}>{mutation.isPending ? 'Publishing…' : 'Publish discussion ↗'}</button></form></section>;
}
