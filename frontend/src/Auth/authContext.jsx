/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { refreshSession, setTokenGetter, setTokenUpdater, setLogoutHandler } from '../apiClient.js';

const AuthContext = createContext(null);
function reducer(state, action) {
  if (action.type === 'LOGIN') return { ...action.payload, loading: false };
  if (action.type === 'LOGOUT') return { user: null, accessToken: null, loading: false };
  if (action.type === 'TOKEN_REFRESHED') return { ...state, accessToken: action.payload.accessToken };
  if (action.type === 'USER_UPDATED') return { ...state, user: action.payload };
  return state;
}
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { user: null, accessToken: null, loading: true });
  const tokenRef = useRef(null);
  const channelRef = useRef(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('commonground-session') : null;
    channelRef.current = channel;
    setTokenGetter(() => tokenRef.current);
    setTokenUpdater(token => { tokenRef.current = token; dispatch({ type: 'TOKEN_REFRESHED', payload: { accessToken: token } }); });
    setLogoutHandler(() => { tokenRef.current = null; queryClient.clear(); dispatch({ type: 'LOGOUT' }); });
    let active = true;
    if (channel) channel.onmessage = async event => {
      if (event.data?.type === 'logout') {
        tokenRef.current = null; queryClient.clear(); dispatch({ type: 'LOGOUT' });
      } else if (['login', 'profile'].includes(event.data?.type)) {
        try {
          const data = await refreshSession();
          if (active) { queryClient.clear(); tokenRef.current = data.accessToken; dispatch({ type: 'LOGIN', payload: data }); }
        } catch { if (active) { tokenRef.current = null; queryClient.clear(); dispatch({ type: 'LOGOUT' }); } }
      }
    };
    refreshSession().then(data => { if (active) { tokenRef.current = data.accessToken; dispatch({ type: 'LOGIN', payload: data }); } }).catch(() => { if (active) dispatch({ type: 'LOGOUT' }); });
    return () => { active = false; channel?.close(); channelRef.current = null; };
  }, [queryClient]);
  async function authenticate(mode, fields) {
    const { data } = await api.post(`/auth/${mode}`, fields);
    queryClient.clear();
    tokenRef.current = data.accessToken;
    dispatch({ type: 'LOGIN', payload: data });
    channelRef.current?.postMessage({ type: 'login' });
  }
  async function logout() {
    await api.post('/auth/logout');
    tokenRef.current = null;
    queryClient.clear();
    dispatch({ type: 'LOGOUT' });
    channelRef.current?.postMessage({ type: 'logout' });
  }
  function userDispatch(action) {
    dispatch(action);
    if (action.type === 'USER_UPDATED') channelRef.current?.postMessage({ type: 'profile' });
  }
  return <AuthContext.Provider value={{ ...state, dispatch: userDispatch, authenticate, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be inside AuthProvider');
  return context;
}
