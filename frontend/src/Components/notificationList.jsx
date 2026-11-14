import { useState } from 'react';
import { useNotifications } from '../Context/notificationContext.jsx';
import { useToast } from '../Context/toastContext.jsx';
import { NotificationItem } from './notificationItems.jsx';
export function NotificationList({ onClose }) {
  const { notifications, unreadCount, markAllRead, loading, error, reload } = useNotifications();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  async function markAll() { setBusy(true); try { await markAllRead(); } catch (error) { showToast(error.message, 'error'); } finally { setBusy(false); } }
  return <div><div className="section-heading"><h3>Notifications <small>({unreadCount})</small></h3><button className="text-button" disabled={!unreadCount || busy} onClick={markAll}>Read all</button></div>{loading && <p role="status">Loading…</p>}{error && <p className="error" role="alert">{error} <button onClick={reload}>Retry</button></p>}{!loading && !notifications.length && <p className="meta">You’re all caught up. Replies and chat messages will appear here.</p>}<ul className="notification-list">{notifications.map(notification => <NotificationItem key={notification.id} notification={notification} onClose={onClose} />)}</ul></div>;
}
