import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, Users } from 'lucide-react';
import { buildGroupWorkload, buildWeeklyProgress, buildAssigneeWorkload } from '../lib/chartData';

const EmptyState = ({ text }) => (
  <div className="py-12 text-center text-slate-400 font-bold">{text}</div>
);

export default function ChartsPage({ tasks, logs, groups, usersById }) {
  const groupData = useMemo(() => buildGroupWorkload(tasks, groups), [tasks, groups]);
  const weeklyData = useMemo(() => buildWeeklyProgress(tasks, 12), [tasks]);
  const assigneeData = useMemo(() => buildAssigneeWorkload(tasks, logs, usersById), [tasks, logs, usersById]);

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto w-full">
      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-indigo-600" /> 小組工作量
        </h2>
        {groupData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={groupData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="group" tick={{ fontSize: 12, fontWeight: 700 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fontWeight: 700 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontWeight: 700 }} />
              <Bar dataKey="total" fill="#6366f1" name="總數" radius={[8, 8, 0, 0]} />
              <Bar dataKey="done" fill="#10b981" name="已完成" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="目前尚無小組資料" />
        )}
      </section>

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-emerald-600" /> 週進度（最近 12 週新增 vs 完成）
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fontWeight: 700 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fontWeight: 700 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontWeight: 700 }} />
            <Line type="monotone" dataKey="created" stroke="#6366f1" name="新增" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="completed" stroke="#10b981" name="完成" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <Users className="w-6 h-6 text-rose-600" /> 負擔分布（每位成員進行中工作數）
        </h2>
        {assigneeData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(240, assigneeData.length * 40 + 80)}>
            <BarChart data={assigneeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fontWeight: 700 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fontWeight: 700 }} />
              <Tooltip />
              <Bar dataKey="doing" fill="#f43f5e" name="進行中" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="目前無進行中工作" />
        )}
      </section>
    </div>
  );
}
