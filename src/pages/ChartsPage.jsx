import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, Users, Layers, PieChart as PieIcon, AlertCircle } from 'lucide-react';
import { buildGroupWorkload, buildWeeklyProgress, buildAssigneeWorkload, buildStatusBreakdown, buildUpcomingDeadlines } from '../lib/chartData';

const EmptyState = ({ text }) => (
  <div className="py-12 text-center text-slate-400 font-bold">{text}</div>
);

const GroupChip = ({ label, active, onClick, dotClass }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 py-2 rounded-full border text-sm font-black transition-all ${
      active
        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-100 ring-offset-1 shadow-sm'
        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'
    }`}
  >
    {dotClass && <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />}
    {label}
  </button>
);

export default function ChartsPage({ tasks, logs, groups, usersById }) {
  const [selectedGroup, setSelectedGroup] = useState('');

  const filteredTasks = useMemo(
    () => (selectedGroup ? tasks.filter(t => t.group === selectedGroup) : tasks),
    [tasks, selectedGroup]
  );

  const groupData = useMemo(() => buildGroupWorkload(filteredTasks, groups), [filteredTasks, groups]);
  const weeklyData = useMemo(() => buildWeeklyProgress(filteredTasks, 12), [filteredTasks]);
  const assigneeData = useMemo(() => buildAssigneeWorkload(filteredTasks, logs, usersById), [filteredTasks, logs, usersById]);
  const statusData = useMemo(() => buildStatusBreakdown(filteredTasks, logs), [filteredTasks, logs]);
  const upcomingData = useMemo(() => buildUpcomingDeadlines(filteredTasks, logs), [filteredTasks, logs]);
  const statusTotal = statusData.reduce((s, d) => s + d.count, 0);
  const upcomingTotal = upcomingData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto w-full">
      <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Layers className="w-5 h-5 text-slate-400" />
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">依執行小組篩選</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <GroupChip label="全部" active={!selectedGroup} onClick={() => setSelectedGroup('')} />
          {groups.map(g => (
            <GroupChip
              key={g.id}
              label={g.name}
              active={selectedGroup === g.name}
              onClick={() => setSelectedGroup(g.name)}
              dotClass={g.color?.active || 'bg-slate-400'}
            />
          ))}
        </div>
      </section>

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

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <PieIcon className="w-6 h-6 text-amber-600" /> 完成率（狀態比例）
        </h2>
        {statusTotal > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={110}
                innerRadius={60}
                paddingAngle={2}
                label={({ count }) => (count > 0 ? `${Math.round((count / statusTotal) * 100)}%` : '')}
              >
                {statusData.map(s => <Cell key={s.key} fill={s.color} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} 件`, n]} />
              <Legend wrapperStyle={{ fontWeight: 700 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="目前尚無工作" />
        )}
      </section>

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-orange-600" /> 即將到期任務
        </h2>
        {upcomingTotal > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={upcomingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="window" tick={{ fontSize: 12, fontWeight: 700 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fontWeight: 700 }} />
              <Tooltip />
              <Bar dataKey="count" name="工作數" radius={[8, 8, 0, 0]}>
                {upcomingData.map((d, i) => {
                  const colors = ['#f43f5e', '#f59e0b', '#fbbf24', '#94a3b8'];
                  return <Cell key={d.window} fill={colors[i]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="未來 30 天內無到期工作" />
        )}
      </section>
    </div>
  );
}
