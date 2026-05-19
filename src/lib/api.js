const API_BASE = '/api';

export const getToken = () => localStorage.getItem('wt_token');

const authHeaders = (extra = {}) => ({
  ...extra,
  Authorization: `Bearer ${getToken()}`,
});

const handleJson = async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};

export const apiPost = (col, data) =>
  fetch(`${API_BASE}/${col}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(handleJson);

export const apiPatch = (col, id, data) =>
  fetch(`${API_BASE}/${col}/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  }).then(handleJson);

export const apiDelete = (col, id) =>
  fetch(`${API_BASE}/${col}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(handleJson);

export const usersApi = {
  list: () => fetch(`${API_BASE}/users`, { headers: authHeaders() }).then(handleJson),
  // 給任務 assignee picker 用，任何登入者可叫；只回 { id, username }
  options: () => fetch(`${API_BASE}/users/options`, { headers: authHeaders() }).then(handleJson),
  create: (payload) => fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  }).then(handleJson),
  update: (id, payload) => fetch(`${API_BASE}/users/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  }).then(handleJson),
  // admin 改他人密碼不需 oldPassword；user 改自己必須帶 oldPassword
  resetPassword: (id, password, oldPassword) => fetch(`${API_BASE}/users/${id}/reset-password`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(oldPassword !== undefined ? { password, oldPassword } : { password }),
  }).then(handleJson),
  disable: (id) => fetch(`${API_BASE}/users/${id}/disable`, {
    method: 'POST',
    headers: authHeaders(),
  }).then(handleJson),
  enable: (id) => fetch(`${API_BASE}/users/${id}/enable`, {
    method: 'POST',
    headers: authHeaders(),
  }).then(handleJson),
  remove: (id) => fetch(`${API_BASE}/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).then(handleJson),
};
