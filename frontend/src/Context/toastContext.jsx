/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import ToastContainer from '../Components/toastContainer.jsx';
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  useEffect(() => {
    const activeTimers = timers.current;
    return () => { for (const timer of activeTimers.values()) clearTimeout(timer); activeTimers.clear(); };
  }, []);
  const dismissToast = useCallback(id => {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);
  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = crypto.randomUUID();
    setToasts(current => [...current, { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismissToast(id), duration));
  }, [dismissToast]);
  return <ToastContext.Provider value={{ showToast, dismissToast }}>{children}<ToastContainer toasts={toasts} onDismiss={dismissToast} /></ToastContext.Provider>;
}
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider is required');
  return context;
}
