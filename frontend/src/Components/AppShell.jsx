import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../Auth/authContext.jsx';
import { useToast } from '../Context/toastContext.jsx';
import ThreadsPage from '../Pages/threadsPages.jsx';
import ThreadDetail from '../Pages/threadDetail.jsx';
import AuthPage from '../Pages/authPage.jsx';
import ProfilePage from '../Pages/profilePage.jsx';
import AdminPage from '../Pages/adminPage.jsx';
import CreateThreadForm from './createThreadsForm.jsx';
import { PrivateRoute } from './PrivateRoute.jsx';
import RoleGate from './RoleGate.jsx';
import { NotificationDropdown } from './notificationDropdown.jsx';
import { NotificationList } from './notificationList.jsx';
export default function AppShell() {
  const { user, loading, logout } = useAuth();
  const { showToast } = useToast();
  async function signOut() { try { await logout(); showToast('Signed out.', 'info'); } catch (error) { showToast(error.message, 'error'); } }
  return <div className="app"><header className="site-header"><Link className="brand" to="/"><span className="brand-mark">c.</span>common<span className="brand-dot">ground</span></Link><nav aria-label="Main navigation"><NavLink to="/">Discussions</NavLink>{!loading && (user ? <><NotificationDropdown /><NavLink to="/profile">{user.name}</NavLink><RoleGate><NavLink to="/admin">Admin</NavLink></RoleGate><button className="secondary" onClick={signOut}>Sign out</button></> : <><NavLink to="/login">Sign in</NavLink><Link className="button small" to="/register">Join us ↗</Link></>)}</nav></header><main className="container">{loading ? <p role="status">Restoring your session…</p> : <Routes><Route path="/" element={<ThreadsPage />} /><Route path="/threads" element={<ThreadsPage />} /><Route path="/threads/new" element={<PrivateRoute><CreateThreadForm /></PrivateRoute>} /><Route path="/threads/:id" element={<ThreadDetail />} /><Route path="/login" element={<AuthPage key="login" mode="login" />} /><Route path="/register" element={<AuthPage key="register" mode="register" />} /><Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} /><Route path="/notifications" element={<PrivateRoute><section className="card"><NotificationList /></section></PrivateRoute>} /><Route path="/admin" element={<PrivateRoute><RoleGate fallback={<section className="card"><h1>Administrator access required</h1><Link to="/">Back to discussions</Link></section>}><AdminPage /></RoleGate></PrivateRoute>} /><Route path="*" element={<section className="card"><h1>Page not found</h1><Link to="/">Back to discussions</Link></section>} /></Routes>}</main><footer><span className="brand">commonground</span><span>A little curiosity goes a long way.</span><Link to="/">Back to the community ↑</Link></footer></div>;
}
