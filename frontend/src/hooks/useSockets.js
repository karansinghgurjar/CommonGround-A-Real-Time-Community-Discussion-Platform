import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../Auth/authContext.jsx';
import { refreshSession } from '../apiClient.js';

let scriptPromise;
function loadSocketClient() {
  if (window.io) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = resolve;
    script.onerror = () => { scriptPromise = null; script.remove(); reject(new Error('Could not load chat. Check the backend connection.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}
export function useSocket(roomId) {
  const { user } = useAuth();
  const userId = user?.id;
  const socketRef = useRef(null);
  const [state, setState] = useState({ messages: [], connected: false, error: '' });
  useEffect(() => {
    if (!userId || !roomId) return;
    let active = true;
    let socket;
    let timer;
    function retry() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const next = await refreshSession();
          if (!active) return;
          if (socket) { socket.auth = { token: next.accessToken }; socket.connect(); }
          else connect();
        } catch (error) {
          if (active) {
            setState(previous => ({ ...previous, error: error.status === 401 ? 'Please sign in again.' : 'Connection unavailable. Retrying…' }));
            if (error.status !== 401) retry();
          }
        }
      }, 3000);
    }
    async function connect() {
      try {
        const [session] = await Promise.all([refreshSession(), loadSocketClient()]);
        if (!active) return;
        socket = window.io({ auth: { token: session.accessToken }, autoConnect: false });
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('room:join', roomId, result => {
          if (active) setState({ messages: result.messages || [], connected: !result.error, error: result.error || '' });
        }));
        socket.on('chat:message', message => setState(previous => ({ ...previous, messages: [...previous.messages.filter(m => m.id !== message.id), message] })));
        socket.on('thread:deleted', () => setState(previous => ({ ...previous, connected: false, error: 'This thread was deleted.' })));
        socket.on('disconnect', reason => {
          setState(previous => ({ ...previous, connected: false }));
          if (reason === 'io server disconnect') setState(previous => ({ ...previous, error: 'Session ended. Refresh the page to reconnect.' }));
        });
        socket.on('connect_error', error => {
          if (!active) return;
          setState(previous => ({ ...previous, connected: false, error: error.message }));
          // Refresh credentials before retrying a rejected authentication handshake.
          retry();
        });
        socket.connect();
      } catch (error) { if (active) { setState({ messages: [], connected: false, error: error.message }); retry(); } }
    }
    connect();
    return () => { active = false; clearTimeout(timer); socket?.removeAllListeners(); socket?.disconnect(); socketRef.current = null; };
  }, [roomId, userId]);
  const sendMessage = useCallback(text => new Promise((resolve, reject) => {
    if (!socketRef.current?.connected) { reject(new Error('Chat is disconnected.')); return; }
    socketRef.current.timeout(7000).emit('chat:message', { roomId, text }, (error, result) => {
      if (error || result?.error) reject(new Error(result?.error || 'Message was not confirmed.'));
      else resolve(true);
    });
  }), [roomId]);
  return { ...state, sendMessage };
}
