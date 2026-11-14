import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../Auth/authContext.jsx';
import api from '../apiClient.js';

export function useNotificationHistory(dispatch) {
  const { user } = useAuth();
  const userId = user?.id;
  const pending = useRef(null);
  const [status, setStatus] = useState({ loading: false, error: '' });
  const reload = useCallback(async (background = false) => {
    pending.current?.abort();
    if (!userId) { dispatch({ type: 'LOAD_NOTIFICATIONS', payload: [] }); return; }
    const controller = new AbortController();
    pending.current = controller;
    if (!background) setStatus({ loading: true, error: '' });
    try {
      const { data } = await api.get('/notifications', { signal: controller.signal });
      if (controller.signal.aborted) return;
      dispatch({ type: 'LOAD_NOTIFICATIONS', payload: data });
      setStatus({ loading: false, error: '' });
    } catch (error) { if (!controller.signal.aborted) setStatus({ loading: false, error: error.message }); }
  }, [userId, dispatch]);
  useEffect(() => {
    // Start outside the effect body so loading state follows the asynchronous request.
    const timer = setTimeout(() => { reload(); }, 0);
    // Recover notifications missed during a lost or suspended stream connection.
    const poll = userId ? setInterval(() => { reload(true); }, 15000) : undefined;
    function visible() { if (document.visibilityState === 'visible') reload(true); }
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); clearInterval(poll); pending.current?.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [reload, userId]);
  return { ...status, reload };
}
