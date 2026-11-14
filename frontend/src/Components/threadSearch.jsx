export default function ThreadSearch({ value, onChange }) {
  return <label className="search"><span className="sr-only">Search threads</span><span aria-hidden="true">⌕</span><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="Search titles, discussions, or authors…" maxLength={200} /></label>;
}
