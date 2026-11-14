import { useQuery } from '@tanstack/react-query';
import api from '../apiClient.js';
export default function AdminPage() {
  const { data: users = [], isPending, error } = useQuery({ queryKey: ['admin-users'], queryFn: async () => (await api.get('/admin/users')).data });
  return <section className="card"><span className="eyebrow">ADMINISTRATION</span><h1>Community members</h1><p>Administrators can moderate discussions using the delete action on each discussion page.</p>{isPending ? <p role="status">Loading members…</p> : error ? <p role="alert" className="error">{error.message}</p> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><span className="pill">{user.role}</span></td></tr>)}</tbody></table></div>}</section>;
}
