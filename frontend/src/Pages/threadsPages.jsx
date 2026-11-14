import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../Auth/authContext.jsx';
import useDebounce from '../hooks/useDebounce.js';
import { fetchThreads } from '../Services/threadService.js';
import ThreadSearch from '../Components/threadSearch.jsx';
import ThreadItem from '../Components/threadItem.jsx';
import SkeletonList from '../Components/skeletonList.jsx';

export default function ThreadsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { data: threads = [], isPending, error, refetch } = useQuery({ queryKey: ['threads', debouncedSearch], queryFn: () => fetchThreads(debouncedSearch), refetchInterval: 15000 });
  return <>
    <section className="hero"><span className="eyebrow">A SPACE FOR CURIOUS MINDS</span><h1>Good questions.<br /><span>Great conversations.</span></h1><p>Share what you know, ask what you don’t, and build something together.</p><Link className="button" to={user ? '/threads/new' : '/register'}>{user ? 'Start a discussion' : 'Join the community'} <span>↗</span></Link></section>
    <div className="section-heading"><div><span className="eyebrow">THE COMMUNITY BOARD</span><h2>Latest discussions</h2></div><span className="pill">{threads.length} {threads.length === 1 ? 'discussion' : 'discussions'}</span></div>
    <ThreadSearch value={search} onChange={setSearch} />
    {isPending ? <SkeletonList /> : error ? <div className="card error" role="alert">{error.message} <button onClick={() => refetch()}>Try again</button></div> : !threads.length ? <div className="empty card"><h3>{search ? 'No matching discussions' : 'The next conversation starts with you.'}</h3><p>{search ? 'Try another word or clear your search.' : 'Post the first question, idea, or discovery.'}</p><Link to={user ? '/threads/new' : '/register'} className="button">Start a discussion</Link></div> : <div className="thread-list">{threads.map(thread => <ThreadItem key={thread.id} thread={thread} />)}</div>}
  </>;
}
