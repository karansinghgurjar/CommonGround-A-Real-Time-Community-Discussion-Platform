import { useEffect, useRef, useState } from 'react';
import { uploadAvatar } from '../apiClient.js';
import { useAuth } from '../Auth/authContext.jsx';
import { useToast } from '../Context/toastContext.jsx';
import { useQueryClient } from '@tanstack/react-query';
export default function AvatarUploader() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState('');
  const input = useRef(null);
  const { user, dispatch } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Browser object URLs are released when the selection changes or the page closes.
    const timer = setTimeout(() => setPreview(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  function select(selected) {
    if (!selected || busy) return;
    setError(''); setProgress(0); setUploaded(''); setPreview(''); setFile(null);
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(selected.type)) { setError('Choose a JPEG, PNG, WebP, or GIF image.'); return; }
    if (selected.size > 5 * 1024 * 1024) { setError('Image must not exceed 5 MB.'); return; }
    setFile(selected);
  }
  async function upload() {
    setBusy(true); setError(''); setProgress(0);
    try {
      const result = await uploadAvatar(file, setProgress);
      dispatch({ type: 'USER_UPDATED', payload: result.user }); setUploaded(result.url); setProgress(100);
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      showToast('Avatar updated.', 'success');
    } catch (error) { setError(error.message); setProgress(0); }
    finally { setBusy(false); }
  }
  return <section><h2>Profile photo</h2><div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files[0]); }}>
    {(preview || user.avatar) && <img className="avatar-preview" src={preview || user.avatar} alt="Your profile preview" />}
    <p>{file ? file.name : 'Drop an image here, or choose a file'}</p><button className="secondary" type="button" disabled={busy} onClick={() => input.current.click()}>Choose image</button><input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { select(event.target.files[0]); event.target.value = ''; }} /><p className="meta">JPEG, PNG, WebP, GIF · Up to 5 MB</p></div>
    {error && <p role="alert" className="error">{error}</p>}<button disabled={!file || busy} onClick={upload}>{busy ? `Uploading ${progress}%…` : 'Upload avatar'}</button>{busy && <progress value={progress} max="100" aria-label="Upload progress" />}{uploaded && <p><a href={uploaded} target="_blank" rel="noreferrer">View uploaded image ↗</a></p>}
  </section>;
}
