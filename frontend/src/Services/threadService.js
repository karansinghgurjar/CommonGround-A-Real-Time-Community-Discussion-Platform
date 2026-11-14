import api from '../apiClient.js';
export async function fetchThreads(search = '') {
  return (await api.get(`/threads?search=${encodeURIComponent(search)}`)).data;
}
