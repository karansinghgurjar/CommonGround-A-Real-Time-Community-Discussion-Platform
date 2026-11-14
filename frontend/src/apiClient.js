let tokenGetter = () => null;
let tokenUpdater = () => {};
let logoutHandler = () => {};
let refreshPromise;
export const setTokenGetter = getter => { tokenGetter = getter; };
export const setTokenUpdater = updater => { tokenUpdater = updater; };
export const setLogoutHandler = handler => { logoutHandler = handler; };
export async function refreshSession() {
  if (!refreshPromise) refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then(async response => {
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Please sign in.' : 'Session refresh failed. Please try again.');
      error.status = response.status;
      if (response.status === 401) logoutHandler();
      throw error;
    }
    const data = await response.json();
    tokenUpdater(data.accessToken);
    return data;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function request(method, url, body, retry = true, options = {}) {
  const headers = {};
  if (tokenGetter()) headers.Authorization = `Bearer ${tokenGetter()}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url.startsWith('/api/') ? url : `/api${url}`, { method, credentials: 'include', headers, signal: options.signal, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401 && retry && !url.includes('/auth/')) {
    await refreshSession();
    return request(method, url, body, false, options);
  }
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.message || 'Request failed.'); error.status = response.status; throw error; }
  return { data };
}
export async function uploadAvatar(file, onProgress) {
  await refreshSession();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Authorization', `Bearer ${tokenGetter()}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total)); };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('Invalid server response.')); return; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.message || 'Upload failed.'));
    };
    xhr.timeout = 60000;
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please try again.'));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    const data = new FormData(); data.append('avatar', file); xhr.send(data);
  });
}
const apiClient = {
  get: (url, options) => request('GET', url, undefined, true, options), post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body), delete: url => request('DELETE', url),
};
export default apiClient;
