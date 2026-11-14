import { Link } from 'react-router-dom';
export default function ThreadItem({ thread }) {
  return <article className="thread-item card">
    <div className="avatar">{thread.authorAvatar ? <img src={thread.authorAvatar} alt={thread.author} /> : thread.author.slice(0, 1).toUpperCase()}</div>
    <div className="body"><h3><Link to={`/threads/${thread.id}`}>{thread.title}</Link></h3><p className="excerpt">{thread.content}</p><p className="meta">{thread.author} · {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'} · {new Date(thread.createdAt).toLocaleDateString()}</p></div>
    <span aria-hidden="true">↗</span>
  </article>;
}
