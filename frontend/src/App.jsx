import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './Auth/authContext.jsx';
import { NotificationProvider } from './Context/notificationContext.jsx';
import { ToastProvider } from './Context/toastContext.jsx';
import AppShell from './Components/AppShell.jsx';
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5000 } } });
function SessionContents() {
  const { user } = useAuth();
  return <ToastProvider><NotificationProvider key={user?.id || 'guest'}><AppShell /></NotificationProvider></ToastProvider>;
}
export default function App() {
  return <QueryClientProvider client={client}><BrowserRouter><AuthProvider><SessionContents /></AuthProvider></BrowserRouter></QueryClientProvider>;
}
