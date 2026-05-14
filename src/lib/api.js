const API_BASE = '/api';

export const getToken = () => localStorage.getItem('wt_token');

const authHeaders = (extra = {}) => ({
  ...extra,
  Authorization: `Bearer ${getToken()}`,
});

export const apiPost = (col, data) =>
  fetch(`${API_BASE}/${col}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(r => r.json());

export const apiPatch = (col, id, data) =>
  fetch(`${API_BASE}/${col}/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });

export const apiDelete = (col, id) =>
  fetch(`${API_BASE}/${col}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
