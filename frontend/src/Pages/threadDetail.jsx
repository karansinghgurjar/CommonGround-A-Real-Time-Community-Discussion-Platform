import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../apiClient.js';
import { useAuth } from '../Auth/authContext.jsx';
import { useToast } from '../Context/toastContext.jsx';
import ChatRoom from '../Components/chatRoom.jsx';

export default function ThreadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: thread, isPending, error } = useQuery({ queryKey: ['thread', id], queryFn: async () => (await api.get(`/threads/${id}`)).data, refetchInterval: 10000 });
  const reply = useMutation({ mutationFn: () => api.post(`/threads/${id}/replies`, { content: content.trim() }), onSuccess: () => { setContent(''); queryClient.invalidateQueries({ queryKey: ['thread', id] }); queryClient.invalidateQueries({ queryKey: ['threads'] }); showToast('Reply posted.', 'success'); }, onError: error => showToast(error.message, 'error') });
  const remove = useMutation({ mutationFn: () => api.delete(`/threads/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['threads'] }); showToast('Discussion deleted.', 'success'); navigate('/'); }, onError: error => showToast(error.message, 'error') });
  if (isPending) return <p role="status">Loading discussion…</p>;
  if (error) return <div className="card error" role="alert">{error.message} <Link to="/">Back to discussions</Link></div>;
  return <><Link className="back" to="/">← All discussions</Link><article className="card discussion"><span className="eyebrow">COMMUNITY DISCUSSION</span><h1>{thread.title}</h1><p className="meta">By {thread.author} · {new Date(thread.createdAt).toLocaleString()}</p><p className="prose">{thread.content}</p>{user && (user.id === thread.authorId || user.role === 'admin') && (confirmDelete ? <div className="confirm" role="alert"><p>Delete this discussion, its replies, and chat history?</p><button className="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>Confirm delete</button> <button className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : <button className="text-button danger-text" onClick={() => setConfirmDelete(true)}>Delete discussion</button>)}</article><section className="card"><h2>{thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}</h2>{thread.replies.map(item => <article key={item.id} className="reply"><strong>{item.author}</strong><time>{new Date(item.createdAt).toLocaleString()}</time><p className="prose">{item.content}</p></article>)}{user ? <form onSubmit={event => { event.preventDefault(); if (content.trim()) reply.mutate(); }}><label>Add your reply<textarea value={content} onChange={event => setContent(event.target.value)} required maxLength={10000} rows={3} /></label><button disabled={reply.isPending || !content.trim()}>{reply.isPending ? 'Posting…' : 'Post reply'}</button></form> : <p><Link to="/login">Sign in</Link> to reply and join the live chat.</p>}</section>{user && <ChatRoom key={id} roomId={id} />}</>;
}
