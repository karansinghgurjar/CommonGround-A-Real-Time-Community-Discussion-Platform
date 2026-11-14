import { useState } from 'react';
import { useSocket } from '../hooks/useSockets.js';
export default function ChatRoom({ roomId }) {
  const { messages, connected, error, sendMessage } = useSocket(roomId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (!text.trim() || sending) return;
    setSending(true); setSendError('');
    try { await sendMessage(text.trim()); setText(''); }
    catch (error) { setSendError(error.message); }
    finally { setSending(false); }
  }
  return <section className="card chat"><div className="section-heading"><h2>Live conversation</h2><span className={`pill ${connected ? 'online' : ''}`}>{connected ? '● Connected' : '○ Disconnected'}</span></div><p className="meta">Chat with people in this discussion. Recent messages are saved.</p>{(error || sendError) && <p className="error" role="alert">{sendError || error}</p>}<div className="messages" role="log" aria-label="Chat messages">{!messages.length && <p className="meta">No messages yet. Say hello.</p>}{messages.map(message => <article className="message" key={message.id}><strong>{message.user}</strong><time>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><p>{message.text}</p></article>)}</div><form onSubmit={submit} className="inline-form"><input aria-label="Chat message" value={text} onChange={event => setText(event.target.value)} maxLength={2000} placeholder="Write a message…" disabled={!connected || sending} /><button disabled={!connected || !text.trim() || sending}>{sending ? 'Sending…' : 'Send'}</button></form></section>;
}
