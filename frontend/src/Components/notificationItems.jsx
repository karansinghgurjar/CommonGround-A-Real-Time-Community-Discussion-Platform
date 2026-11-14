import { Link } from 'react-router-dom';
import { useNotifications } from '../Context/notificationContext.jsx';
import { useToast } from '../Context/toastContext.jsx';
export function NotificationItem({ notification, onClose }) {
  const { markRead } = useNotifications();
  const { showToast } = useToast();
  async function read() { try { await markRead(notification.id); } catch (error) { showToast(error.message, 'error'); } }
  return <li className={`notification-item ${notification.isRead ? '' : 'unread'}`}>
    <Link to={`/threads/${notification.threadId}`} onClick={() => { if (!notification.isRead) read(); onClose?.(); }}>{notification.message}</Link>
    <time>{new Date(notification.createdAt).toLocaleString()}</time>
    {!notification.isRead && <button className="text-button" onClick={read}>Mark as read</button>}
  </li>;
}
