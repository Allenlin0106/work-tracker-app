import React, { useEffect, useState } from 'react';
import { Loader2, Trash2, Plus, KeyRound, ShieldCheck, ShieldOff, UserCog } from 'lucide-react';
import { usersApi } from '../lib/api';
import { isStrongPassword, PASSWORD_HINT } from '../lib/security';

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-bold text-slate-600 mb-1">{label}</span>
    {children}
  </label>
);

export default function AccountsPage({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  // 新增表單
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const [creating, setCreating] = useState(false);

  // 重設密碼
  const [resetFor, setResetFor] = useState(null);
  const [resetPw, setResetPw] = useState('');

  const refresh = async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await usersApi.list();
      setUsers(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.username.trim()) { setErr('帳號為必填'); return; }
    if (!isStrongPassword(form.password)) { setErr(PASSWORD_HINT); return; }
    setCreating(true);
    try {
      await usersApi.create(form);
      setForm({ username: '', password: '', role: 'user' });
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleDisabled = async (u) => {
    setBusyId(u.id);
    setErr('');
    try {
      if (u.disabled) await usersApi.enable(u.id);
      else await usersApi.disable(u.id);
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleChangeRole = async (u, role) => {
    if (u.role === role) return;
    setBusyId(u.id);
    setErr('');
    try {
      await usersApi.update(u.id, { role });
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`確定刪除帳號「${u.username}」？此動作無法復原。`)) return;
    setBusyId(u.id);
    setErr('');
    try {
      await usersApi.remove(u.id);
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!resetFor) return;
    if (!isStrongPassword(resetPw)) { setErr(PASSWORD_HINT); return; }
    setBusyId(resetFor.id);
    setErr('');
    try {
      await usersApi.resetPassword(resetFor.id, resetPw);
      setResetFor(null);
      setResetPw('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <UserCog className="w-7 h-7 text-indigo-600" />
        <h2 className="text-2xl font-black text-slate-800">帳號管理</h2>
      </div>

      {err && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">{err}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-black text-slate-700 mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> 新增帳號</h3>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field label="帳號">
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
            />
          </Field>
          <Field label="密碼">
            <input
              type="password"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </Field>
          <Field label="角色">
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={creating}
            className="bg-indigo-600 text-white rounded-xl py-2 text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            建立
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">{PASSWORD_HINT}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-black text-slate-700">使用者列表</h3>
          <button onClick={refresh} className="text-xs text-indigo-600 hover:underline">重新整理</button>
        </div>
        {loading ? (
          <div className="p-10 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left px-5 py-3 font-bold">帳號</th>
                <th className="text-left px-5 py-3 font-bold">角色</th>
                <th className="text-left px-5 py-3 font-bold">狀態</th>
                <th className="text-left px-5 py-3 font-bold">建立時間</th>
                <th className="text-right px-5 py-3 font-bold">動作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-bold text-slate-800">
                    {u.username}
                    {u.id === currentUserId && <span className="ml-2 text-[10px] text-indigo-600">(自己)</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={u.role}
                      disabled={busyId === u.id || u.id === currentUserId}
                      onChange={e => handleChangeRole(u, e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {u.disabled
                      ? <span className="text-rose-600 text-xs font-bold">已停用</span>
                      : <span className="text-emerald-600 text-xs font-bold">啟用中</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{new Date(u.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => { setResetFor(u); setResetPw(''); }}
                      disabled={busyId === u.id}
                      className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" /> 改密碼
                    </button>
                    <button
                      onClick={() => handleToggleDisabled(u)}
                      disabled={busyId === u.id || u.id === currentUserId}
                      className={`text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1 ${u.disabled ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                    >
                      {u.disabled ? <><ShieldCheck className="w-3 h-3" />啟用</> : <><ShieldOff className="w-3 h-3" />停用</>}
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={busyId === u.id || u.id === currentUserId}
                      className="text-xs px-2 py-1 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> 刪除
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400 text-sm">尚無使用者</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {resetFor && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleReset} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-800 mb-3">重設「{resetFor.username}」的密碼</h3>
            <input
              type="password"
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              placeholder="新密碼"
            />
            <p className="text-xs text-slate-500 mt-2">{PASSWORD_HINT}</p>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => { setResetFor(null); setResetPw(''); }} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button type="submit" disabled={busyId === resetFor.id} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">確認</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
