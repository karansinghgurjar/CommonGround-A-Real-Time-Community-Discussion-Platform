import { useEffect, useRef, useState } from 'react';
import { NotificationBell } from './notificationBell.jsx';
import { NotificationList } from './notificationList.jsx';
import { Link } from 'react-router-dom';
export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function close(event) { if ((event.type === 'keydown' && event.key === 'Escape') || (event.type === 'mousedown' && !ref.current?.contains(event.target))) setOpen(false); }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return <div className="notification-dropdown" ref={ref}><NotificationBell open={open} onClick={() => setOpen(previous => !previous)} />{open && <div className="notification-menu"><NotificationList onClose={() => setOpen(false)} /><Link to="/notifications" onClick={() => setOpen(false)}>View notification history →</Link></div>}</div>;
}
