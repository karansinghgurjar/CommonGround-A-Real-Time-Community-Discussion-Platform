/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../apiClient.js';
import { useSSE } from '../hooks/useSSE.js';
import { useNotificationHistory } from '../hooks/usenotificationhistory.jsx';

const Context = createContext(null);
function reducer(state, action) {
  if (action.type === 'LOAD_NOTIFICATIONS') return action.payload;
  if (action.type === 'ADD_NOTIFICATION') return [action.payload, ...state.filter(n => n.id !== action.payload.id)];
  if (action.type === 'MARK_READ') return state.map(n => n.id === action.payload ? { ...n, isRead: true } : n);
  if (action.type === 'MARK_ALL_READ') return state.map(n => ({ ...n, isRead: true }));
  return state;
}
export function NotificationProvider({ children }) {
  const [notifications, dispatch] = useReducer(reducer, []);
  const queryClient = useQueryClient();
  const { loading, error, reload } = useNotificationHistory(dispatch);
  useSSE('/api/notifications/stream', data => {
    if (data.type === 'sync') { reload(true); return; }
    dispatch({ type: 'ADD_NOTIFICATION', payload: data });
    reload(true);
    queryClient.invalidateQueries({ queryKey: ['thread', data.threadId] });
    queryClient.invalidateQueries({ queryKey: ['threads'] });
  });
  async function markRead(id) {
    await api.post(`/notifications/${id}/read`);
    dispatch({ type: 'MARK_READ', payload: id });
    await reload(true);
  }
  async function markAllRead() {
    // Optimistically update, then reload server state if the request fails.
    dispatch({ type: 'MARK_ALL_READ' });
    try { await api.post('/notifications/read-all'); await reload(true); }
    catch (error) { await reload(); throw error; }
  }
  return <Context.Provider value={{ notifications, dispatch, unreadCount: notifications.filter(n => !n.isRead).length, markRead, markAllRead, loading, error, reload }}>{children}</Context.Provider>;
}
export function useNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error('NotificationProvider is required');
  return value;
}
