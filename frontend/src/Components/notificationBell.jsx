import { useNotifications } from '../Context/notificationContext.jsx';
export function NotificationBell({ onClick, open }) {
  const { unreadCount } = useNotifications();
  return <button className="bell secondary" onClick={onClick} aria-label={`Notifications, ${unreadCount} unread`} aria-expanded={open}>♧ <span>Notifications</span>{unreadCount > 0 && <b className="badge">{unreadCount > 99 ? '99+' : unreadCount}</b>}</button>;
}
