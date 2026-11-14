import { useEffect, useRef } from 'react';
import { useAuth } from '../Auth/authContext.jsx';
import { refreshSession } from '../apiClient.js';

export function useSSE(url, onMessage) {
  const { user } = useAuth();
  const userId = user?.id;
  const callback = useRef(onMessage);
  useEffect(() => { callback.current = onMessage; }, [onMessage]);
  useEffect(() => {
    if (!userId || !url) return;
    const controller = new AbortController();
    let timer;
    async function connect() {
      try {
        const { accessToken } = await refreshSession();
        if (controller.signal.aborted) return;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error('Notification stream unavailable');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const line = event.split('\n').find(line => line.startsWith('data: '));
            if (line) callback.current(JSON.parse(line.slice(6)));
          }
        }
      } catch (error) { if (error.name !== 'AbortError') console.debug('Reconnecting notification stream'); }
      if (!controller.signal.aborted) timer = setTimeout(connect, 3000);
    }
    connect();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [url, userId]);
}
