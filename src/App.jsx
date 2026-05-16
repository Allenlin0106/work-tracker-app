import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Plus, CheckCircle2, Clock, AlertCircle, Filter,
  Search, Trash2, Calendar, List, MessageSquare, X, Send,
  CheckSquare, Square, AlertTriangle, ChevronRight, ArrowUpDown,
  User, Layers, Activity, ChevronDown, ChevronUp, Pencil, Repeat, Loader2,
  CheckCircle, BookOpen, Settings2, Check, Timer, CalendarDays, Target, RefreshCw,
  Newspaper, CheckCircle as CheckIcon, Tag,
  Link, Paperclip, ExternalLink, Upload
} from 'lucide-react';
import { socket } from './lib/socket';
import { apiPost, apiPatch, apiDelete } from './lib/api';
import { isSafeUrl, PASSWORD_HINT, isStrongPassword } from './lib/security';
import { formatDate, formatFullDateTime, toLocalMidnight } from './lib/dateUtils';
import { getTaskStatus, checkIsCurrent, displayAssignee } from './lib/taskStatus';
import { compressImage } from './lib/imageUtils';
import { callRecurTask } from './lib/recurrence';
import AccountsPage from './pages/AccountsPage';
import LogsQueryPage from './pages/LogsQueryPage';
import { useToast } from './components/ToastProvider';

// --- 1. 核心常數定義 ---

// 執行小組的顏色選項 (7色)
const GROUP_COLOR_OPTIONS = [
  { label: '靛藍', bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', active: 'bg-indigo-600' },
  { label: '琥珀', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', active: 'bg-amber-600' },
  { label: '翡翠', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', active: 'bg-emerald-600' },
  { label: '玫瑰', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', active: 'bg-rose-600' },
  { label: '紫色', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', active: 'bg-purple-600' },
  { label: '天藍', bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', active: 'bg-sky-600' },
  { label: '石板', bg: 'bg-slate-200', text: 'text-slate-700', border: 'border-slate-300', active: 'bg-slate-600' },
];

// 專案標籤的獨立顏色選項 (18色，剛好兩排)
const TAG_COLOR_OPTIONS = [
  { label: '紅色', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', active: 'bg-red-600' },
  { label: '橘色', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', active: 'bg-orange-600' },
  { label: '琥珀', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', active: 'bg-amber-600' },
  { label: '黃色', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', active: 'bg-yellow-600' },
  { label: '萊姆', bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', active: 'bg-lime-600' },
  { label: '綠色', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', active: 'bg-green-600' },
  { label: '翡翠', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', active: 'bg-emerald-600' },
  { label: '青色', bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', active: 'bg-teal-600' },
  { label: '青藍', bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', active: 'bg-cyan-600' },
  { label: '天藍', bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', active: 'bg-sky-600' },
  { label: '藍色', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', active: 'bg-blue-600' },
  { label: '靛藍', bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', active: 'bg-indigo-600' },
  { label: '紫羅蘭', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', active: 'bg-violet-600' },
  { label: '紫色', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', active: 'bg-purple-600' },
  { label: '紫紅', bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200', active: 'bg-fuchsia-600' },
  { label: '粉紅', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', active: 'bg-pink-600' },
  { label: '玫瑰', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', active: 'bg-rose-600' },
  { label: '灰白', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', active: 'bg-gray-600' },
];

const RECURRENCE_TYPES = [
  { label: "日", value: "daily", Icon: RefreshCw },
  { label: "週", value: "weekly", Icon: Repeat },
  { label: "月", value: "monthly", Icon: Calendar }
];

const STATUS_FILTER_TYPES = [
  { label: "未開始", value: "todo", theme: "slate", Icon: Clock, color: "slate" },
  { label: "進行中", value: "doing", theme: "blue", Icon: AlertCircle, color: "blue" },
  { label: "已完成", value: "done", theme: "emerald", Icon: CheckCircle2, color: "emerald" },
  { label: "已逾期", value: "delayed", theme: "rose", Icon: AlertTriangle, color: "rose" }
];

// --- 2. 核心輔助函數 ---
// formatDate / formatFullDateTime / toLocalMidnight / displayAssignee / getTaskStatus
// / checkIsCurrent / compressImage 已抽至 src/lib/{dateUtils,taskStatus,imageUtils}.js

// --- 3. 子組件定義 ---

const FilterChip = ({ label, isActive, onClick, activeClass, unselectedClass }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-xl text-sm font-black border transition-all active:scale-95 flex items-center gap-1.5 ${
      isActive ? `${activeClass} text-white shadow-md ring-2 ring-offset-1` : `${unselectedClass} hover:border-slate-400`
    }`}
  >
    {isActive && <Check className="w-4 h-4" />}
    {label}
  </button>
);

const RecurrenceBadgeDisplay = ({ task }) => {
  const config = RECURRENCE_TYPES.find(o => o.value === task.recurrenceType);
  if (!task.isRecurring || !config) return null;
  const RecurIcon = config.Icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm uppercase tracking-tighter mt-1 mb-1">
      <RecurIcon className="w-3 h-3" /> 每 {task.recurrenceInterval} {config.label}
    </span>
  );
};

// --- 4. 主應用組件 ---

export default function App() {
  const toast = useToast();
  const [authState, setAuthState] = useState(() => localStorage.getItem('wt_token') ? 'loading' : 'check');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUsername, setCurrentUsername] = useState(() => localStorage.getItem('wt_username') || '');
  const [currentRole, setCurrentRole] = useState(() => localStorage.getItem('wt_role') || 'user');
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem('wt_user_id') || '');
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [tags, setTags] = useState([]); 
  
  const [viewMode, setViewMode] = useState("list"); 
  const [ganttScale, setGanttScale] = useState("week"); 
  const [expandedTasks, setExpandedTasks] = useState(new Set()); 
  
  // 新增：排序狀態 (預設依據工作項目 title 升冪排序)
  const [sortConfig, setSortConfig] = useState({ key: 'title', direction: 'asc' });

  const [filters, setFilters] = useState({ groups: [], statuses: [], assignees: [], tags: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [isManagingGroups, setIsManagingGroups] = useState(false);
  const [isManagingTags, setIsManagingTags] = useState(false); 
  
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState(false); 
  const [isRecurProcessing, setIsRecurProcessing] = useState(false);
  const [showRecurConfirm, setShowRecurConfirm] = useState(false);
  
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLOR_OPTIONS[0]);
  const [editingGroupId, setEditingGroupId] = useState(null); 
  
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_OPTIONS[0]); 
  const [editingTagId, setEditingTagId] = useState(null); 

  const [newLogText, setNewLogText] = useState("");
  const [editingLogId, setEditingLogId] = useState(null);

  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newChecklistStartDate, setNewChecklistStartDate] = useState(formatDate(new Date()));
  const [newChecklistEndDate, setNewChecklistEndDate] = useState(formatDate(new Date()));
  const [editingChecklistId, setEditingChecklistId] = useState(null);
  
  const [checklistError, setChecklistError] = useState(""); 
  const [formError, setFormError] = useState(""); 

  const [assigneeInput, setAssigneeInput] = useState("");
  
  const [detailLinkName, setDetailLinkName] = useState("");
  const [detailLinkUrl, setDetailLinkUrl] = useState("");

  const [previewImage, setPreviewImage] = useState(null);

  // 新增：週報自定義時間範圍狀態 (預設值為過去 7 天)
  const [reportRange, setReportRange] = useState({
    start: formatDate(new Date(Date.now() - 86400000 * 7)), 
    end: formatDate(new Date()) 
  });

  // 新增：週報過濾掉已標記標籤的工作項目狀態
  const [hideTaggedInReport, setHideTaggedInReport] = useState(false);

  const INITIAL_TASK_FORM = {
    title: '', group: '', assignee: [], startDate: formatDate(new Date()),
    endDate: formatDate(new Date(Date.now() + 86400000 * 7)),
    isRecurring: false, recurrenceType: 'weekly', recurrenceInterval: 1,
    tags: [],
    attachments: [] 
  };

  const [taskForm, setTaskForm] = useState(INITIAL_TASK_FORM);

  useEffect(() => {
    const onConnect = () => setAuthState('ready');
    const onConnectError = (err) => {
      if (err.message === 'unauthorized') {
        localStorage.removeItem('wt_token');
        localStorage.removeItem('wt_username');
        setCurrentUsername('');
        setAuthState('login');
      }
    };

    socket.on('tasks:updated', setTasks);
    socket.on('logs:updated', setLogs);
    socket.on('groups:updated', setGroups);
    socket.on('tags:updated', setTags);
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);

    const token = localStorage.getItem('wt_token');
    if (token) {
      socket.auth = { token };
      socket.connect();
    } else {
      fetch('/api/auth/status')
        .then(r => r.json())
        .then(data => setAuthState(data.needsSetup ? 'setup' : 'login'))
        .catch(() => setAuthState('login'));
    }

    return () => {
      socket.off('tasks:updated', setTasks);
      socket.off('logs:updated', setLogs);
      socket.off('groups:updated', setGroups);
      socket.off('tags:updated', setTags);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  const decodeJwt = (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload || {};
    } catch {
      return {};
    }
  };

  const persistAuth = (data) => {
    const payload = decodeJwt(data.token);
    localStorage.setItem('wt_token', data.token);
    localStorage.setItem('wt_username', data.username);
    localStorage.setItem('wt_role', data.role || payload.role || 'user');
    localStorage.setItem('wt_user_id', payload.userId || '');
    setCurrentUsername(data.username);
    setCurrentRole(data.role || payload.role || 'user');
    setCurrentUserId(payload.userId || '');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await r.json();
      if (!r.ok) { setLoginError(data.error || '登入失敗'); return; }
      persistAuth(data);
      socket.auth = { token: data.token };
      socket.connect();
      setAuthState('loading');
    } catch {
      setLoginError('網路錯誤，請重試');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    if (!isStrongPassword(loginForm.password)) {
      setLoginError(PASSWORD_HINT);
      setIsLoggingIn(false);
      return;
    }
    try {
      const r = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await r.json();
      if (!r.ok) { setLoginError(data.error || '建立失敗'); return; }
      persistAuth(data);
      socket.auth = { token: data.token };
      socket.connect();
      setAuthState('loading');
    } catch {
      setLoginError('網路錯誤，請重試');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wt_token');
    localStorage.removeItem('wt_username');
    localStorage.removeItem('wt_role');
    localStorage.removeItem('wt_user_id');
    socket.disconnect();
    setAuthState('login');
    setCurrentUsername('');
    setCurrentRole('user');
    setCurrentUserId('');
    setTasks([]);
    setLogs([]);
    setGroups([]);
    setTags([]);
  };

  const allUniqueAssignees = useMemo(() => {
    const names = new Set();
    tasks.forEach(t => {
      if (Array.isArray(t.assignee)) {
        t.assignee.forEach(a => { if (a) names.add(String(a)); });
      } else if (t.assignee) {
        names.add(String(t.assignee));
      }
    });
    return Array.from(names).sort();
  }, [tasks]);

  const rememberedAssignees = useMemo(() => {
    const counts = {};
    tasks.forEach(t => {
      if (Array.isArray(t.assignee)) {
        t.assignee.forEach(a => { if (a) counts[a] = (counts[a] || 0) + 1; });
      } else if (t.assignee) {
        counts[t.assignee] = (counts[t.assignee] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  }, [tasks]);

  // 新增：將標籤自動分為「進行中」與「已完成」狀態
  const { activeTags, completedTags } = useMemo(() => {
    const active = [];
    const completed = [];
    tags.forEach(t => {
      const relatedTasks = tasks.filter(task => (task.tags || []).includes(t.name));
      // 若該標籤有任務，且所有關聯任務的進度皆為 100%，則歸類至「已完成」
      if (relatedTasks.length > 0 && relatedTasks.every(task => task.progress >= 100)) {
        completed.push(t);
      } else {
        active.push(t);
      }
    });
    return { activeTags: active, completedTags: completed };
  }, [tags, tasks]);

  // --- 過濾邏輯 ---
  const currentViewRange = useMemo(() => {
    const now = new Date();
    if (viewMode === 'weekly') {
      const start = toLocalMidnight(reportRange.start);
      const end = new Date(reportRange.end);
      end.setHours(23, 59, 59, 999); // 確保包含結束當天的所有時間
      return { start, end };
    } else if (viewMode === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end };
    }
    return null; 
  }, [viewMode, reportRange]);

  const tasksInRange = useMemo(() => {
    if (!currentViewRange) return tasks;
    const { start, end } = currentViewRange;
    return tasks.filter(t => {
      const hasRecentLog = logs.some(l => {
        if (l.taskId !== t.id) return false;
        const logDate = l.timestamp ? new Date(l.timestamp) : new Date();
        return logDate >= start && logDate <= end;
      });
      const hasRecentChecklist = (t.checklist || []).some(i => {
        if (!i.completed || !i.actualDoneDate) return false;
        const doneDate = toLocalMidnight(i.actualDoneDate.split(' ')[0]);
        return doneDate >= start && doneDate <= end;
      });
      return hasRecentLog || hasRecentChecklist;
    });
  }, [tasks, logs, currentViewRange]);

  const baseFilteredTasks = useMemo(() => {
    return tasksInRange.filter(task => {
      const matchesGroup = filters.groups.length === 0 || filters.groups.includes(task.group);
      const matchesAssignee = filters.assignees.length === 0 || filters.assignees.some(a => {
        if (Array.isArray(task.assignee)) return task.assignee.includes(a);
        return task.assignee === a;
      });
      const matchesTag = filters.tags.length === 0 || filters.tags.some(tag => (task.tags || []).includes(tag));
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = String(task.title || "").toLowerCase().includes(searchLower) ||
                            (task.tags || []).some(tag => tag.toLowerCase().includes(searchLower)) ||
                            (Array.isArray(task.assignee) ? task.assignee.some(a => String(a).toLowerCase().includes(searchLower)) : String(task.assignee || "").toLowerCase().includes(searchLower));

      return matchesGroup && matchesAssignee && matchesTag && matchesSearch;
    });
  }, [tasksInRange, filters.groups, filters.assignees, filters.tags, searchTerm]);

  const dashboardStats = useMemo(() => {
    const counts = { total: baseFilteredTasks.length, todo: 0, doing: 0, done: 0, delayed: 0 };
    baseFilteredTasks.forEach(t => {
      const s = getTaskStatus(t, logs).value;
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }, [baseFilteredTasks, logs]);

  // 新增：整合過濾與「排序」邏輯
  const visibleTasks = useMemo(() => {
    let result = baseFilteredTasks;
    if (filters.statuses.length > 0) {
      result = result.filter(task => filters.statuses.includes(getTaskStatus(task, logs).value));
    }
    
    // 依據 sortConfig 進行排序
    return [...result].sort((a, b) => {
      const aVal = String(a[sortConfig.key] || '').toLowerCase();
      const bVal = String(b[sortConfig.key] || '').toLowerCase();
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      // 確保排序穩定性
      return String(a.id).localeCompare(String(b.id));
    });
  }, [baseFilteredTasks, filters.statuses, logs, sortConfig]);

  const reportData = useMemo(() => {
    if (!currentViewRange) return [];
    const { start, end } = currentViewRange;
    return visibleTasks.map(t => {
      // 依據新增狀態檢查：若開啟「隱藏標籤」功能且任務本身擁有標籤，則在週報/月報中過濾掉
      if (hideTaggedInReport && t.tags && t.tags.length > 0) return null;

      const taskLogs = logs.filter(l => {
        if (l.taskId !== t.id) return false;
        const logDate = l.timestamp ? new Date(l.timestamp) : new Date();
        return logDate >= start && logDate <= end;
      }).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

      const taskChecklistActivity = (t.checklist || []).filter(i => {
        if (!i.completed || !i.actualDoneDate) return false;
        const doneDate = toLocalMidnight(i.actualDoneDate.split(' ')[0]);
        return doneDate >= start && doneDate <= end;
      });

      if (taskLogs.length === 0 && taskChecklistActivity.length === 0) return null;
      return { task: t, taskLogs, taskChecklistActivity };
    }).filter(Boolean);
  }, [visibleTasks, logs, currentViewRange, hideTaggedInReport]);

  const lastMonthLabel = useMemo(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${last.getFullYear()}年${last.getMonth() + 1}月`;
  }, []);

  const ganttConfig = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const units = [];
    let topHeaders = [];
    let startOfTimeline, endOfTimeline, colWidth, unitDuration;

    if (ganttScale === 'day') {
      // 日檢視：顯示當月
      startOfTimeline = new Date(curYear, curMonth, 1);
      endOfTimeline = new Date(curYear, curMonth + 1, 0, 23, 59, 59);
      colWidth = 48; 
      unitDuration = 86400000;
      
      const daysInMonth = endOfTimeline.getDate();
      topHeaders = [{ label: `${curYear}年 ${curMonth + 1}月`, span: daysInMonth }];
      
      for (let i = 0; i < daysInMonth; i++) {
        const d = new Date(curYear, curMonth, i + 1);
        units.push({ date: d, label: d.getDate(), subLabel: ['日','一','二','三','四','五','六'][d.getDay()] });
      }

    } else if (ganttScale === 'week') {
      // 週檢視：顯示上個月、這個月、下個月的區間 (共三個月)，讓檢視空間足夠
      startOfTimeline = new Date(curYear, curMonth - 1, 1);
      // 對齊至當週的星期日
      startOfTimeline.setDate(startOfTimeline.getDate() - startOfTimeline.getDay()); 
      
      endOfTimeline = new Date(curYear, curMonth + 2, 0); 
      // 對齊至當週的星期六
      endOfTimeline.setDate(endOfTimeline.getDate() + (6 - endOfTimeline.getDay())); 
      
      colWidth = 100; // 週的格子比較寬
      unitDuration = 86400000 * 7;
      
      // 計算該日期是該月的第幾週 (W1 ~ W5)
      const getWeekOfMonth = (d) => {
        const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
        return Math.ceil((d.getDate() + firstDay) / 7);
      };

      let tempDate = new Date(startOfTimeline);
      let currentMonth = null;

      while (tempDate <= endOfTimeline) {
        const d = new Date(tempDate);
        const monthNum = d.getMonth() + 1;
        const weekNum = getWeekOfMonth(d);
        
        units.push({ 
          date: new Date(tempDate), 
          label: `W${weekNum}`, 
          subLabel: `${monthNum}/${d.getDate()}` 
        });

        const uniqueMonthId = `${d.getFullYear()}-${monthNum}`;
        if (!currentMonth || currentMonth.id !== uniqueMonthId) {
          if (currentMonth) topHeaders.push(currentMonth);
          currentMonth = { id: uniqueMonthId, label: `${d.getFullYear()}年 ${monthNum}月`, span: 1 };
        } else {
          currentMonth.span += 1;
        }

        tempDate.setDate(tempDate.getDate() + 7);
      }
      if (currentMonth) topHeaders.push(currentMonth);

    } else { 
      // 月檢視：顯示當前年份
      startOfTimeline = new Date(curYear, 0, 1); 
      endOfTimeline = new Date(curYear, 11, 31, 23, 59, 59);
      colWidth = 140; 
      unitDuration = 86400000 * 30.44; 
      topHeaders = [{ label: `${curYear}年`, span: 12 }];
      
      for (let i = 0; i < 12; i++) {
        const d = new Date(curYear, i, 1);
        units.push({ date: d, label: `${i + 1}月`, subLabel: '月份' });
      }
    }
    return { units, topHeaders, startOfTimeline, endOfTimeline, colWidth, unitDuration };
  }, [ganttScale]);

  const getGanttPos = (dateStr) => {
    const target = toLocalMidnight(dateStr);
    const clampedTarget = new Date(Math.max(target.getTime(), ganttConfig.startOfTimeline.getTime()));
    
    if (ganttScale === 'month') {
      const yearDiff = clampedTarget.getFullYear() - ganttConfig.startOfTimeline.getFullYear();
      const monthDiff = clampedTarget.getMonth() - ganttConfig.startOfTimeline.getMonth() + (yearDiff * 12);
      const daysInMonth = new Date(clampedTarget.getFullYear(), clampedTarget.getMonth() + 1, 0).getDate();
      const dayOffset = (clampedTarget.getDate() - 1) / daysInMonth;
      return (monthDiff + dayOffset) * ganttConfig.colWidth;
    }
    
    const offset = clampedTarget.getTime() - ganttConfig.startOfTimeline.getTime();
    return (offset / ganttConfig.unitDuration) * ganttConfig.colWidth;
  };

  const getGanttWidth = (start, end) => {
    const s = toLocalMidnight(start); 
    const e = toLocalMidnight(end);
    const effectiveStart = new Date(Math.max(s.getTime(), ganttConfig.startOfTimeline.getTime()));
    const effectiveEnd = new Date(Math.min(e.getTime(), ganttConfig.endOfTimeline.getTime()));
    
    if (effectiveEnd < effectiveStart) return 0;
    
    if (ganttScale === 'month') {
      const startPos = getGanttPos(effectiveStart);
      const eNext = new Date(effectiveEnd);
      eNext.setDate(eNext.getDate() + 1);
      const endPos = getGanttPos(eNext);
      return Math.max(endPos - startPos, 4); 
    }

    const duration = effectiveEnd.getTime() - effectiveStart.getTime() + 86400000;
    return Math.max((duration / ganttConfig.unitDuration) * ganttConfig.colWidth, 4);
  };

  const ganttVisibleTasks = useMemo(() => {
    if (viewMode !== 'gantt') return [];
    const { startOfTimeline, endOfTimeline } = ganttConfig;
    return visibleTasks.filter(task => {
      const taskStart = toLocalMidnight(task.startDate);
      const taskEnd = toLocalMidnight(task.endDate);
      return taskStart <= endOfTimeline && taskEnd >= startOfTimeline;
    });
  }, [visibleTasks, viewMode, ganttConfig]);

  // --- 事件處理 ---
  
  // 新增：處理表頭點擊排序
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleAddChecklistItem = async () => {
    setChecklistError("");
    if (!newChecklistItem.trim()) { setChecklistError("請輸入內容"); return; }
    if (!selectedTaskId) return;
    const task = tasks.find(x => x.id === selectedTaskId);
    if (!task) return;
    try {
      let newList;
      if (editingChecklistId) {
        newList = (task.checklist || []).map(i => 
          i.id === editingChecklistId 
            ? { ...i, text: newChecklistItem.trim(), startDate: newChecklistStartDate, dueDate: newChecklistEndDate } 
            : i
        );
      } else {
        const newItem = { id: Date.now(), text: newChecklistItem.trim(), completed: false, startDate: newChecklistStartDate, dueDate: newChecklistEndDate, actualDoneDate: null };
        newList = [...(task.checklist || []), newItem];
      }
      const progress = newList.length > 0 ? Math.round((newList.filter(i => i.completed).length / newList.length) * 100) : 0;
      await apiPatch('tasks', task.id, { checklist: newList, progress });
      setNewChecklistItem("");
      setEditingChecklistId(null);
    } catch (err) { setChecklistError("存儲失敗"); }
  };

  const handleAddAssignee = () => {
    const val = assigneeInput.trim();
    if (val && !taskForm.assignee.includes(val)) {
      setTaskForm(prev => ({ ...prev, assignee: [...prev.assignee, val] }));
    }
    setAssigneeInput("");
  };

  const handleDetailImageUpload = async (e, taskId, currentAttachments = []) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, async (dataUrl) => {
      const newAttachment = { id: Date.now(), type: 'image', url: dataUrl, name: file.name };
      const updatedAttachments = [...currentAttachments, newAttachment];
      await apiPatch('tasks', taskId, { attachments: updatedAttachments });
    });
    e.target.value = '';
  };

  const handleDetailAddLink = async (taskId, currentAttachments = []) => {
    if(!detailLinkUrl.trim()) return;
    let finalUrl = detailLinkUrl.trim();
    if(!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    if (!isSafeUrl(finalUrl)) {
      setFormError('連結網址不安全（僅允許 http/https/mailto/tel）');
      return;
    }
    const newAttachment = { id: Date.now(), type: 'link', url: finalUrl, name: detailLinkName.trim() || finalUrl };
    const updatedAttachments = [...currentAttachments, newAttachment];
    await apiPatch('tasks', taskId, { attachments: updatedAttachments });
    setDetailLinkName("");
    setDetailLinkUrl("");
  };

  const handleDetailDeleteAttachment = async (taskId, currentAttachments = [], attachmentId) => {
    const updatedAttachments = currentAttachments.filter(a => a.id !== attachmentId);
    await apiPatch('tasks', taskId, { attachments: updatedAttachments });
  };

  const handleSaveTask = async (e) => {
    if (e) e.preventDefault();
    setFormError("");
    
    if (groups.length === 0) { setFormError("請先至右上角設定新增「執行小組」"); return; }
    if (!taskForm.title.trim()) { setFormError("請輸入工作標題"); return; }
    if (!taskForm.group) { setFormError("請選擇執行小組"); return; }
    if (!taskForm.assignee || taskForm.assignee.length === 0) { setFormError("請新增至少一位負責人員"); return; }

    setIsSubmittingTask(true);
    try {
      if (editingTaskId) {
        await apiPatch('tasks', editingTaskId, { ...taskForm });
      } else {
        await apiPost('tasks', { ...taskForm, progress: 0, checklist: [] });
      }
      setIsTaskModalOpen(false); 
      setEditingTaskId(null); 
      setTaskForm(INITIAL_TASK_FORM);
      setAssigneeInput("");
    } catch (err) { 
      console.error("Task Save Error:", err);
      setFormError("儲存失敗: " + err.message); 
    } finally { 
      setIsSubmittingTask(false); 
    }
  };

  const handleSaveGroup = async (e) => {
    if (e) e.preventDefault();
    if (!newGroupName.trim()) return;
    setIsSavingGroup(true);
    try {
      if (editingGroupId) {
        const oldGroup = groups.find(g => g.id === editingGroupId);
        await apiPatch('groups', editingGroupId, { name: newGroupName, color: newGroupColor });
        if (oldGroup && oldGroup.name !== newGroupName) {
          for (const t of tasks.filter(t => t.group === oldGroup.name)) {
            await apiPatch('tasks', t.id, { group: newGroupName });
          }
        }
        setEditingGroupId(null);
      } else {
        await apiPost('groups', { name: newGroupName, color: newGroupColor });
      }
      setNewGroupName("");
      setNewGroupColor(GROUP_COLOR_OPTIONS[0]);
    } catch (err) {
      console.error(err);
    } finally { setIsSavingGroup(false); }
  };

  const handleDeleteGroup = async (groupId, groupName) => {
    try {
      for (const t of tasks.filter(t => t.group === groupName)) {
        await apiPatch('tasks', t.id, { group: "" });
      }
      await apiDelete('groups', groupId);
      if (editingGroupId === groupId) { setEditingGroupId(null); setNewGroupName(""); }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveTag = async (e) => {
    if (e) e.preventDefault();
    if (!newTagName.trim()) return;
    setIsSavingTag(true);
    try {
      if (editingTagId) {
        const oldTag = tags.find(t => t.id === editingTagId);
        await apiPatch('tags', editingTagId, { name: newTagName, color: newTagColor });
        if (oldTag && oldTag.name !== newTagName) {
          for (const t of tasks.filter(t => (t.tags || []).includes(oldTag.name))) {
            await apiPatch('tasks', t.id, { tags: t.tags.map(n => n === oldTag.name ? newTagName : n) });
          }
        }
        setEditingTagId(null);
      } else {
        await apiPost('tags', { name: newTagName, color: newTagColor });
      }
      setNewTagName("");
      setNewTagColor(TAG_COLOR_OPTIONS[0]);
    } catch (err) {
      console.error(err);
    } finally { setIsSavingTag(false); }
  };

  const handleDeleteTag = async (tagId, tagName) => {
    try {
      for (const t of tasks.filter(t => (t.tags || []).includes(tagName))) {
        await apiPatch('tasks', t.id, { tags: t.tags.filter(n => n !== tagName) });
      }
      await apiDelete('tags', tagId);
      if (editingTagId === tagId) { setEditingTagId(null); setNewTagName(""); }
    } catch (e) {
      console.error(e);
    }
  };

  // 循環任務（FE-4 + BE-5）：呼叫後端 /api/tasks/:id/recur
  // 後端負責標記目前任務完成 + 建立下一週期 task；前端只接受結果並關閉 UI
  const executeRecurrence = async (task) => {
    setIsRecurProcessing(true);
    try {
      await callRecurTask(task.id);
      setShowRecurConfirm(false);
      setSelectedTaskId(null);
      toast.success('已建立下一週期');
    } catch (err) {
      toast.error(err.message || '循環失敗');
    } finally {
      setIsRecurProcessing(false);
    }
  };

  const handleSendLog = async () => {
    if (!newLogText.trim() || !selectedTaskId) return;
    try {
      if (editingLogId) {
        await apiPatch('logs', editingLogId, { text: String(newLogText) });
        setEditingLogId(null);
      } else {
        await apiPost('logs', { taskId: selectedTaskId, text: String(newLogText), userName: "User", timestamp: new Date().toISOString() });
      }
      setNewLogText("");
    } catch (e) { console.error("[系統] 日誌失敗:", e.message); }
  };

  const handleEditLog = (log) => { setEditingLogId(log.id); setNewLogText(log.text); };

  const handleDeleteLog = async (logId) => {
    try { await apiDelete('logs', logId); if (editingLogId === logId) { setEditingLogId(null); setNewLogText(""); } }
    catch (e) { console.error("[系統] 日誌刪除失敗:", e.message); }
  };

  const toggleFilter = (type, value) => {
    setFilters(prev => {
      const list = prev[type] || [];
      const newList = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
      return { ...prev, [type]: newList };
    });
  };

  const closeTagModal = () => {
    setIsManagingTags(false);
    setEditingTagId(null);
    setNewTagName("");
    setNewTagColor(TAG_COLOR_OPTIONS[0]);
  };

  const closeGroupModal = () => {
    setIsManagingGroups(false);
    setEditingGroupId(null);
    setNewGroupName("");
    setNewGroupColor(GROUP_COLOR_OPTIONS[0]);
  };

  const currentTaskInMemo = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  useEffect(() => {
    if (currentTaskInMemo && currentTaskInMemo.progress >= 100 && currentTaskInMemo.isRecurring) { setShowRecurConfirm(true); } else { setShowRecurConfirm(false); }
  }, [selectedTaskId, currentTaskInMemo?.progress]);

  if (authState !== 'ready') {
    if (authState === 'loading' || authState === 'check') return (
      <div className="h-screen flex items-center justify-center bg-slate-50 font-black text-indigo-600">
        <Loader2 className="animate-spin mr-3" />安全連線初始化中...
      </div>
    );
    const isSetup = authState === 'setup';
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
              <LayoutDashboard className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800">Progress Hub</h1>
            <p className="text-slate-500 text-sm mt-1">{isSetup ? '首次使用，請建立管理員帳號' : '請登入以繼續'}</p>
          </div>
          {loginError && (
            <div className="mb-5 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{loginError}</div>
          )}
          <form onSubmit={isSetup ? handleSetup : handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">帳號</label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                autoFocus
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">密碼</label>
              <input
                type="password"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={loginForm.password}
                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                required
              />
              {isSetup && <p className="text-xs text-slate-500 mt-2">{PASSWORD_HINT}</p>}
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isLoggingIn
                ? <><Loader2 className="w-4 h-4 animate-spin" />{isSetup ? '建立中...' : '登入中...'}</>
                : (isSetup ? '建立帳號' : '登入')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><LayoutDashboard className="w-5 h-5" /></div>
          <h1 className="text-2xl font-black text-indigo-600 uppercase tracking-tight">Progress Hub</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1.5 rounded-xl shadow-inner border border-slate-200">
            {['list', 'gantt', 'weekly', 'monthly', 'logs', ...(currentRole === 'admin' ? ['accounts'] : [])].map(m => (
              <button
                key={m}
                onClick={() => { setViewMode(m); setFilters(prev => ({ ...prev, statuses: [] })); }}
                className={`px-6 py-2 rounded-lg text-base font-bold transition-all ${viewMode === m ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {m === 'list' ? '列表' : m === 'gantt' ? '甘特圖' : m === 'weekly' ? '週報' : m === 'monthly' ? '月報' : m === 'logs' ? '日誌查詢' : m === 'accounts' ? '帳號管理' : ''}
              </button>
            ))}
          </div>
          <button onClick={() => { 
            setEditingTaskId(null); 
            setTaskForm(INITIAL_TASK_FORM); 
            setAssigneeInput("");
            setIsTaskModalOpen(true); 
          }} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-base font-bold shadow-lg flex items-center gap-2 active:scale-95 transition-all"><Plus className="w-5 h-5" />建立任務</button>
          <button onClick={handleLogout} title="登出" className="flex items-center gap-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors px-3 py-2 rounded-xl text-sm font-bold">
            <User className="w-4 h-4" />{currentUsername}
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-[1600px] mx-auto w-full flex flex-col overflow-hidden">
        {viewMode === 'accounts' && currentRole === 'admin' ? (
          <AccountsPage currentUserId={currentUserId} />
        ) : viewMode === 'logs' ? (
          <LogsQueryPage logs={logs} tasks={tasks} />
        ) : (
        <>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8 mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 shadow-inner flex-1">
              <Search className="w-6 h-6 text-slate-300 mr-3" />
              <input type="text" placeholder="搜尋項目標題或標籤名稱..." className="bg-transparent text-base font-bold outline-none w-full text-slate-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {viewMode === 'gantt' && (
              <div className="flex bg-slate-100 p-2 rounded-2xl shadow-inner border border-slate-200">
                {['day', 'week', 'month'].map(s => (
                  <button key={s} onClick={() => setGanttScale(s)} className={`px-4 py-1.5 rounded-xl text-sm font-black transition-all ${ganttScale === s ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500'}`}>
                    {s === 'day' ? '日' : s === 'week' ? '週' : '月'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setIsManagingTags(true)} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm" title="標籤管理"><Tag className="w-6 h-6" /></button>
              <button onClick={() => setIsManagingGroups(true)} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm" title="小組管理"><Settings2 className="w-6 h-6" /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layers className="w-4 h-4" /> 執行小組</p>
              <div className="flex flex-wrap gap-3">
                {groups.map(g => (
                  <FilterChip key={g.id} label={g.name} isActive={filters.groups.includes(g.name)} onClick={() => toggleFilter('groups', g.name)} activeClass={g.color?.active || 'bg-indigo-600'} unselectedClass={`${g.color?.bg || 'bg-slate-50'} ${g.color?.text || 'text-slate-500'} border-transparent shadow-sm`} />
                ))}
              </div>
            </div>
            <div className="space-y-4 border-l border-slate-100 px-0 lg:px-8">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tag className="w-4 h-4" /> 專案標籤</p>
              
              {activeTags.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {activeTags.map(t => (
                    <FilterChip key={t.id} label={t.name} isActive={filters.tags.includes(t.name)} onClick={() => toggleFilter('tags', t.name)} activeClass={t.color?.active || 'bg-indigo-600'} unselectedClass={`${t.color?.bg || 'bg-slate-50'} ${t.color?.text || 'text-slate-500'} border-transparent shadow-sm`} />
                  ))}
                </div>
              ) : (
                <div className="text-sm font-bold text-slate-300 italic py-1">目前無進行中標籤</div>
              )}

              {completedTags.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> 已完成專案標籤
                  </p>
                  <div className="flex flex-wrap gap-2 opacity-60 hover:opacity-100 transition-opacity">
                    {completedTags.map(t => (
                      <FilterChip key={t.id} label={t.name} isActive={filters.tags.includes(t.name)} onClick={() => toggleFilter('tags', t.name)} activeClass={t.color?.active || 'bg-indigo-600'} unselectedClass={`${t.color?.bg || 'bg-slate-50'} ${t.color?.text || 'text-slate-500'} border-transparent shadow-sm`} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-4 border-l border-slate-100 px-0 lg:px-8">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User className="w-4 h-4" /> 負責人員</p>
              <div className="flex flex-wrap gap-3">{allUniqueAssignees.map(name => (<FilterChip key={name} label={name} isActive={filters.assignees.includes(name)} onClick={() => toggleFilter('assignees', name)} activeClass="bg-teal-600" unselectedClass="bg-slate-50 text-slate-500 border-transparent shadow-sm" />))}</div>
            </div>
          </div>
        </div>

        {/* 交互式統計看板 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-10">
          <button onClick={() => setFilters(prev => ({ ...prev, statuses: [] }))} className={`p-6 rounded-3xl border transition-all flex items-center gap-4 text-left group hover:scale-105 active:scale-95 ${filters.statuses.length === 0 ? "bg-white border-indigo-600 shadow-xl ring-4 ring-indigo-50 shadow-slate-200/50" : "bg-white/50 border-slate-200 shadow-sm opacity-70"}`}>
            <div className={`p-3 rounded-2xl transition-colors ${filters.statuses.length === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}><Activity className="w-6 h-6" /></div>
            <div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">{viewMode === 'list' || viewMode === 'gantt' ? '全部任務' : '時段內活動'}</p><p className="text-2xl font-black">{dashboardStats.total}</p></div>
          </button>
          {STATUS_FILTER_TYPES.map((s) => {
            const isActive = filters.statuses.includes(s.value);
            const activeColorClass = s.value === 'done' ? 'bg-emerald-600' : s.value === 'doing' ? 'bg-blue-600' : s.value === 'delayed' ? 'bg-rose-600' : 'bg-slate-600';
            const CurrentIcon = s.Icon;
            return (
              <button key={s.value} onClick={() => toggleFilter('statuses', s.value)} className={`p-6 rounded-3xl border transition-all flex items-center gap-4 text-left group hover:scale-105 active:scale-95 ${isActive ? "bg-white border-indigo-600 shadow-xl ring-4 ring-indigo-50 shadow-slate-200/50" : "bg-white/50 border-slate-200 shadow-sm opacity-70"}`}>
                <div className={`p-3 rounded-2xl transition-colors ${isActive ? activeColorClass + " text-white" : "bg-slate-100 text-slate-400"}`}><CurrentIcon className="w-6 h-6" /></div>
                <div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">{s.label}</p><p className="text-2xl font-black">{dashboardStats[s.value]}</p></div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-xl flex flex-col relative shadow-slate-200/50">
          {viewMode === 'list' && (
            <div className="overflow-auto flex-1 scrollbar-thin">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead className="bg-slate-50 sticky top-0 z-20">
                  <tr>
                    <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('title')}>
                      <div className="flex items-center gap-2">
                        工作項目
                        <span className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                          {sortConfig.key === 'title' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                        </span>
                      </div>
                    </th>
                    <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b cursor-pointer hover:bg-slate-100 transition-colors select-none group" onClick={() => handleSort('group')}>
                      <div className="flex items-center gap-2">
                        執行小組與人員
                        <span className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                          {sortConfig.key === 'group' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                        </span>
                      </div>
                    </th>
                    <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest border-b">進度</th>
                    <th className="px-10 py-6 border-b"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleTasks.map(task => { 
                    const status = getTaskStatus(task, logs); const g = groups.find(x => x.name === task.group);
                    return (
                      <tr key={task.id} className="hover:bg-indigo-50/30 transition-all cursor-pointer group/row" onClick={() => setSelectedTaskId(task.id)}>
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-3 font-bold text-slate-800 text-base">
                            {String(task.title)}
                            <RecurrenceBadgeDisplay task={task} />
                            {task.attachments?.length > 0 && <Paperclip className="w-4 h-4 text-slate-300" />}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-slate-400 font-bold">{task.startDate} ~ {task.endDate}</span>
                            {(() => {
                              const validTags = task.tags ? task.tags.filter(tName => tags.some(t => t.name === tName)) : [];
                              if (validTags.length === 0) return null;
                              return (
                                <div className="flex gap-1.5 ml-3 border-l border-slate-200 pl-3">
                                  {validTags.map(tName => {
                                    const tObj = tags.find(t => t.name === tName) || { color: {} };
                                    return <span key={tName} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${tObj.color?.bg || 'bg-slate-100'} ${tObj.color?.text || 'text-slate-500'}`}>{tName}</span>
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col gap-1.5">
                            <span className={`w-fit text-xs font-black px-3 py-1 border rounded-full ${g?.color?.bg || 'bg-slate-100'} ${g?.color?.text || 'text-slate-500'}`}>{task.group}</span>
                            <span className="text-xs text-slate-400 font-bold ml-1">{displayAssignee(task.assignee)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6"><div className="flex items-center gap-4"><div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner"><div className={`h-full transition-all duration-700 ${status.value === 'delayed' ? 'bg-rose-500' : 'bg-indigo-600'}`} style={{ width: `${task.progress}%` }}></div></div><span className="text-xs font-black text-slate-400">{task.progress}%</span></div></td>
                        <td className="px-10 py-6 text-right flex gap-2 justify-end opacity-0 group-hover/row:opacity-100 transition-all">
                          <button onClick={(e) => { 
                            e.stopPropagation(); 
                            setEditingTaskId(task.id); 
                            setTaskForm({
                              ...task, 
                              tags: (task.tags || []).filter(tName => tags.some(t => t.name === tName)), 
                              assignee: Array.isArray(task.assignee) ? task.assignee : (task.assignee ? [task.assignee] : [])
                            }); 
                            setAssigneeInput("");
                            setIsTaskModalOpen(true); 
                          }} className="p-2.5 text-slate-300 hover:text-indigo-600 transition-all"><Pencil className="w-5 h-5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setTaskToDelete(task); }} className="p-2.5 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-5 h-5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleTasks.length === 0 && <div className="py-40 text-center opacity-30 italic font-black text-2xl">目前無符合過濾條件的工作資料</div>}
            </div>
          )}

          {viewMode === 'gantt' && (
             <div className="flex-1 overflow-auto relative scrollbar-thin">
                <div className="inline-block min-w-full">
                  <div className="flex sticky top-0 z-40 bg-white/95 border-b border-slate-200 backdrop-blur shadow-sm items-stretch">
                    <div className="w-80 shrink-0 bg-slate-50/50 px-8 py-6 font-black text-sm text-slate-400 border-r border-slate-200 uppercase tracking-widest flex items-center justify-center">任務項目</div>
                    <div className="flex flex-col shrink-0">
                      <div className="flex border-b border-slate-200">
                        {ganttConfig.topHeaders.map((th, i) => (
                          <div key={i} className="text-center py-1.5 text-xs font-black text-slate-500 uppercase tracking-widest border-r border-slate-200 bg-slate-50/80 flex items-center justify-center" style={{ width: `${th.span * ganttConfig.colWidth}px` }}>
                            {th.label}
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-1">
                        {ganttConfig.units.map((unit, i) => (
                          <div key={i} className={`shrink-0 text-center py-2.5 border-r border-slate-100/50 flex flex-col items-center justify-center ${checkIsCurrent(unit.date, ganttScale) ? 'bg-yellow-50/70 border-b-2 border-b-yellow-400' : ''}`} style={{ width: `${ganttConfig.colWidth}px` }}>
                            <span className="text-[10px] font-black uppercase text-slate-400 leading-none">{unit.subLabel}</span>
                            <span className="text-sm font-black mt-1 text-slate-600 leading-none">{unit.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {ganttVisibleTasks.map(task => {
                    const status = getTaskStatus(task, logs); const isExpanded = expandedTasks.has(task.id);
                    const left = getGanttPos(task.startDate); const width = getGanttWidth(task.startDate, task.endDate);
                    return (
                      <div key={task.id} className="flex border-b border-slate-50 transition-all">
                        <div className="w-80 shrink-0 border-r border-slate-200 bg-white px-8 py-5 sticky left-0 z-20 flex items-center gap-4 shadow-md shadow-slate-100/50">
                          <button onClick={() => { const ns = new Set(expandedTasks); if (ns.has(task.id)) ns.delete(task.id); else ns.add(task.id); setExpandedTasks(ns); }} className="text-slate-300 hover:text-indigo-600 transition-all">{isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}</button>
                          <div className="overflow-hidden cursor-pointer" onClick={() => setSelectedTaskId(task.id)}>
                            <div className="text-base font-black truncate text-slate-700 flex items-center gap-2">
                              {String(task.title)}
                              {task.attachments?.length > 0 && <Paperclip className="w-3 h-3 text-slate-300" />}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="text-xs text-slate-400 font-bold uppercase truncate max-w-[120px]">{displayAssignee(task.assignee)}</div>
                              <div className="text-xs text-slate-400 font-bold">· {task.progress}%</div>
                              {(() => {
                                const validTags = task.tags ? task.tags.filter(tName => tags.some(t => t.name === tName)) : [];
                                if (validTags.length === 0) return null;
                                return (
                                  <div className="flex gap-0.5 ml-1">
                                    {validTags.map(tName => {
                                      const tObj = tags.find(t => t.name === tName) || { color: {} };
                                      return <div key={tName} className={`w-2 h-2 rounded-full ${tObj.color?.active || 'bg-slate-300'}`} title={tName}></div>
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className={`relative pt-8 shrink-0 ${isExpanded ? 'pb-10 bg-slate-50/30' : 'pb-8'}`} style={{ width: `${ganttConfig.units.length * ganttConfig.colWidth}px` }}>
                          <div className="absolute inset-0 z-0 flex pointer-events-none">
                            {ganttConfig.units.map((unit, i) => (<div key={i} className={`h-full border-r border-slate-100/30 ${checkIsCurrent(unit.date, ganttScale) ? 'bg-yellow-50/40' : ''}`} style={{ width: `${ganttConfig.colWidth}px` }} />))}
                          </div>
                          <div className="relative z-10">
                            <div className={`relative h-10 rounded-xl border shadow-sm flex items-center px-5 cursor-pointer bg-white transition-all ${status.value === 'delayed' ? 'border-rose-200' : 'border-indigo-100'}`} style={{ marginLeft: `${left}px`, width: `${Math.max(width, 24)}px` }} onClick={() => setSelectedTaskId(task.id)}>
                              <div className={`absolute left-0 top-0 h-full rounded-xl opacity-20 ${status.value === 'delayed' ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${task.progress}%` }}></div>
                              <span className={`text-xs font-black z-20 ${status.value === 'delayed' ? 'text-rose-700' : 'text-indigo-700'}`}>{task.progress}%</span>
                            </div>
                            {isExpanded && (task.checklist || []).map(item => {
                              const iLeft = getGanttPos(item.startDate || item.dueDate); const iWidth = getGanttWidth(item.startDate || item.dueDate, item.dueDate);
                              return (
                                <div key={item.id} className="relative flex items-center h-7 mt-3" style={{ marginLeft: `${iLeft}px` }}>
                                  <div className={`h-2.5 rounded-full border shadow-sm ${item.completed ? 'bg-emerald-500 border-emerald-200' : 'bg-indigo-500 border-indigo-200'}`} style={{ width: `${Math.max(iWidth, 12)}px` }} />
                                  <span className="ml-4 text-xs font-bold text-slate-500 whitespace-nowrap opacity-80">{String(item.text)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
             </div>
          )}

          {(viewMode === 'weekly' || viewMode === 'monthly') && (
            <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50/50 scrollbar-thin">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <h2 className="text-3xl font-black text-slate-800 flex items-center gap-4 uppercase tracking-tight">
                  {viewMode === 'weekly' ? <Newspaper className="w-10 h-10 text-indigo-600" /> : <BookOpen className="w-10 h-10 text-purple-600" />}
                  {viewMode === 'weekly' ? '週報摘要' : `${lastMonthLabel} 月報摘要`}
                </h2>
                
                <div className="flex flex-wrap items-center gap-4">
                  {/* 新增：隱藏有標籤項目過濾按鈕 */}
                  <button
                    onClick={() => setHideTaggedInReport(prev => !prev)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full border shadow-sm text-sm font-black transition-all ${
                      hideTaggedInReport
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600 ring-2 ring-indigo-100 ring-offset-1'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                    title="過濾掉已有標籤的工作項目"
                  >
                    <Filter className="w-4 h-4" />
                    {hideTaggedInReport ? '已隱藏標籤項目' : '隱藏標籤項目'}
                  </button>

                  {/* 週報專用的自訂日期範圍選擇器 */}
                  {viewMode === 'weekly' ? (
                    <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-full border shadow-sm flex-wrap">
                      <CalendarDays className="w-5 h-5 text-slate-400" />
                      <div className="flex items-center gap-2">
                        <input 
                          type="date" 
                          className="bg-transparent text-sm font-black text-slate-600 outline-none cursor-pointer"
                          value={reportRange.start}
                          onChange={e => setReportRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                        <span className="text-slate-300">~</span>
                        <input 
                          type="date" 
                          className="bg-transparent text-sm font-black text-slate-600 outline-none cursor-pointer"
                          value={reportRange.end}
                          onChange={e => setReportRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                      </div>
                      <button 
                        onClick={() => setReportRange({
                          start: formatDate(new Date(Date.now() - 86400000 * 7)),
                          end: formatDate(new Date())
                        })}
                        className="ml-2 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                        title="重設為預設過去 7 天"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-black text-slate-400 bg-white px-6 py-3 rounded-full border shadow-sm uppercase tracking-widest">
                      範圍：上個完整月份
                    </span>
                  )}
                </div>
              </div>
              
              {reportData.length > 0 ? (
                <div className="overflow-x-auto scrollbar-thin px-2 pb-6">
                  <table className="w-full text-left border-separate min-w-[1000px]" style={{ borderSpacing: '0 1rem' }}>
                    <thead>
                      <tr>
                        <th className="px-8 py-2 text-sm font-black text-slate-400 uppercase tracking-widest w-[30%]">工作項目</th>
                        <th className="px-8 py-2 text-sm font-black text-slate-400 uppercase tracking-widest w-[35%]">日誌回報</th>
                        <th className="px-8 py-2 text-sm font-black text-slate-400 uppercase tracking-widest w-[35%]">已完成細項</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map(({ task, taskLogs, taskChecklistActivity }) => {
                        const status = getTaskStatus(task, logs);
                        const bgClass = status.value === 'done' ? 'bg-emerald-50/40' : status.value === 'doing' ? 'bg-blue-50/40' : status.value === 'delayed' ? 'bg-rose-50/40' : 'bg-white';
                        const indicatorClass = status.value === 'done' ? 'border-l-emerald-400' : status.value === 'doing' ? 'border-l-blue-400' : status.value === 'delayed' ? 'border-l-rose-400' : 'border-l-slate-300';
                        
                        return (
                          <tr key={task.id} className="group align-top hover:-translate-y-1 transition-all duration-300 drop-shadow-sm hover:drop-shadow-md">
                            <td className={`px-8 py-6 rounded-l-2xl border-y border-l border-slate-200 border-l-[6px] ${indicatorClass} ${bgClass}`}>
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <h3 className="font-black text-slate-900 text-lg leading-tight">
                                  {String(task.title)}
                                  <div className="mt-2"><RecurrenceBadgeDisplay task={task} /></div>
                                </h3>
                                <button onClick={() => setSelectedTaskId(task.id)} className="shrink-0 p-2 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold" title="查看詳情">
                                  <ExternalLink className="w-3.5 h-3.5" /> 詳情
                                </button>
                              </div>
                              <div className="space-y-1.5">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-1.5"><User className="w-3.5 h-3.5"/> {displayAssignee(task.assignee)}</div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-1.5"><Layers className="w-3.5 h-3.5"/> {task.group}</div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/> 進度 {task.progress}%</div>
                              </div>
                              {(() => {
                                const validTags = task.tags ? task.tags.filter(tName => tags.some(t => t.name === tName)) : [];
                                if (validTags.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t border-slate-200/50">
                                    {validTags.map(tName => {
                                      const tObj = tags.find(t => t.name === tName) || { color: {} };
                                      return <span key={tName} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${tObj.color?.bg || 'bg-white'} ${tObj.color?.text || 'text-slate-500'} border ${tObj.color?.border || 'border-slate-200'}`}>{tName}</span>
                                    })}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className={`px-8 py-6 border-y border-l border-slate-200 ${bgClass}`}>
                               {taskLogs.length > 0 ? (
                                 <div className="space-y-3">
                                   {taskLogs.map(l => (
                                     <div key={l.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-400 before:rounded-l-xl overflow-hidden">
                                       <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">{String(l.text)}</p>
                                       <div className="mt-2 flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                         <Clock className="w-3 h-3" /> {l.timestamp ? formatFullDateTime(new Date(l.timestamp)) : '傳送中'}
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               ) : <div className="h-full flex items-center justify-center text-sm text-slate-300 italic font-bold opacity-50 py-4">無日誌更新</div>}
                            </td>
                            <td className={`px-8 py-6 rounded-r-2xl border-y border-l border-r border-slate-200 ${bgClass}`}>
                               {taskChecklistActivity.length > 0 ? (
                                 <div className="space-y-3">
                                   {taskChecklistActivity.map(i => (
                                     <div key={i.id} className="flex items-start gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-emerald-400 before:rounded-l-xl overflow-hidden">
                                       <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                       <div>
                                         <p className="text-sm font-bold text-slate-700 leading-tight">{String(i.text)}</p>
                                         <span className="text-[10px] font-black text-emerald-600 block mt-1.5 uppercase tracking-widest">完成時間：{i.actualDoneDate}</span>
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               ) : <div className="h-full flex items-center justify-center text-sm text-slate-300 italic font-bold opacity-50 py-4">無完成細項</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-40 text-center opacity-30 italic font-black text-2xl">此時段無符合過濾條件的更新紀錄</div>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </main>

      {/* 詳情視窗 */}
      {selectedTaskId && currentTaskInMemo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all" onClick={() => { setSelectedTaskId(null); setEditingChecklistId(null); setNewChecklistItem(""); setDetailLinkName(""); setDetailLinkUrl(""); }}>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl flex flex-col md:flex-row max-h-[90vh] overflow-hidden shadow-slate-900/30 animate-in slide-in-from-bottom-8 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex-1 flex flex-col border-r border-slate-100 p-12 overflow-y-auto scrollbar-thin">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-5 py-2 rounded-full text-xs font-black border ${getTaskStatus(currentTaskInMemo, logs).color}`}>{getTaskStatus(currentTaskInMemo, logs).label}</span>
                  <RecurrenceBadgeDisplay task={currentTaskInMemo} />
                  
                  {/* 標籤顯示區塊 */}
                  {(() => {
                    const validTags = currentTaskInMemo.tags ? currentTaskInMemo.tags.filter(tName => tags.some(t => t.name === tName)) : [];
                    if (validTags.length === 0) return null;
                    return (
                      <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">
                        {validTags.map(tName => {
                          const tObj = tags.find(t => t.name === tName) || { color: { bg: 'bg-slate-100', text: 'text-slate-400', border: 'border-slate-200' } };
                          return (
                            <span key={tName} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${tObj.color.bg} ${tObj.color.text} ${tObj.color.border}`}>
                              {tName}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newTags = currentTaskInMemo.tags.filter(name => name !== tName);
                                  apiPatch('tasks', currentTaskInMemo.id, { tags: newTags });
                                }}
                                className="hover:text-rose-500 transition-colors opacity-50 hover:opacity-100 p-0.5 ml-0.5 bg-white/50 hover:bg-white rounded-full"
                                title="從此任務中移除標籤"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                <h3 className="text-4xl font-black text-slate-900 leading-tight uppercase tracking-tight">{String(currentTaskInMemo.title)}</h3>
                <div className="flex flex-col gap-3 mt-4 bg-slate-50 px-5 py-4 rounded-xl border border-slate-100 w-full md:w-fit">
                   <div className="flex flex-wrap items-center gap-2">
                     <div className="flex items-center gap-2 text-sm font-black text-slate-400 uppercase tracking-widest shrink-0"><CalendarDays className="w-5 h-5" /> 計畫時程：</div>
                     <div className="text-base font-black text-slate-700 whitespace-nowrap">{currentTaskInMemo.startDate} <span className="mx-2 text-slate-300">→</span> {currentTaskInMemo.endDate}</div>
                   </div>
                   <div className="flex flex-wrap items-start gap-2">
                     <div className="flex items-center gap-2 text-sm font-black text-slate-400 uppercase tracking-widest shrink-0 mt-0.5"><User className="w-5 h-5" /> 負責人員：</div>
                     <div className="text-base font-black text-slate-700 leading-relaxed">{displayAssignee(currentTaskInMemo.assignee)}</div>
                   </div>
                </div>
              </div>

              {/* 附件與相關網址區塊 */}
              <div className="mb-10">
                <div className="mb-6 flex items-center justify-between">
                  <h4 className="text-lg font-black text-slate-900 flex items-center gap-3 tracking-tight">
                    <Paperclip className="w-6 h-6 text-indigo-500" /> 附件與相關網址
                  </h4>
                </div>

                {currentTaskInMemo.attachments && currentTaskInMemo.attachments.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    {currentTaskInMemo.attachments.filter(att => isSafeUrl(att.url)).map(att => (
                      <div key={att.id} className="relative group">
                        {att.type === 'image' ? (
                          // 修改：點擊圖片時設定 previewImage 狀態
                          <button onClick={() => setPreviewImage(att.url)} className="block w-full h-full relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-sm hover:shadow-md transition-all text-left">
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                              <Search className="w-6 h-6 text-white" />
                            </div>
                          </button>
                        ) : (
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all h-full">
                            <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors"><Link className="w-5 h-5 text-indigo-500" /></div>
                            <div className="overflow-hidden flex-1">
                              <p className="text-sm font-bold text-slate-700 truncate">{att.name}</p>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">{att.url}</p>
                            </div>
                          </a>
                        )}
                        <button 
                          onClick={(e) => { e.preventDefault(); handleDetailDeleteAttachment(currentTaskInMemo.id, currentTaskInMemo.attachments, att.id); }}
                          className="absolute -top-2 -right-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all z-10"
                          title="刪除附件"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 新增附件控制項 */}
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 shadow-inner space-y-4">
                  <div className="flex gap-2 items-center">
                    <input type="text" placeholder="顯示名稱 (選填)" className="w-1/3 p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100" value={detailLinkName} onChange={e=>setDetailLinkName(e.target.value)} />
                    <input type="text" placeholder="網址 https://..." className="flex-1 p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100" value={detailLinkUrl} onChange={e=>setDetailLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleDetailAddLink(currentTaskInMemo.id, currentTaskInMemo.attachments); }} />
                    <button type="button" onClick={() => handleDetailAddLink(currentTaskInMemo.id, currentTaskInMemo.attachments)} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black shadow-md hover:bg-slate-800 transition-all text-sm whitespace-nowrap">新增連結</button>
                  </div>
                  <div className="flex items-center gap-4 pt-2">
                    <label className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors shadow-sm">
                      <Upload className="w-4 h-4 text-indigo-500" /> 上傳電腦圖片
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDetailImageUpload(e, currentTaskInMemo.id, currentTaskInMemo.attachments)} />
                    </label>
                    <span className="text-[10px] font-bold text-slate-400">支援影像格式。系統將自動最佳化並壓縮影像尺寸。</span>
                  </div>
                </div>
              </div>

              <div className="mb-6 flex items-center justify-between">
                <h4 className="text-lg font-black text-slate-900 flex items-center gap-3 tracking-tight"><CheckSquare className="w-6 h-6 text-indigo-500" /> 工作分解項目</h4>
              </div>

              {showRecurConfirm && (
                <div className="mb-6 p-5 bg-indigo-50 rounded-2xl border-2 border-indigo-500 animate-pulse flex items-center justify-between shadow-lg">
                  <p className="text-xs font-black text-indigo-700">任務已 100% 完成！是否要以此為基準複刻下期任務？</p>
                  <div className="flex gap-2">
                    <button disabled={isRecurProcessing} onClick={() => executeRecurrence(currentTaskInMemo)} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-[10px] font-black hover:bg-indigo-700 shadow-md">確認複刻</button>
                    <button onClick={() => setShowRecurConfirm(false)} className="bg-white border border-indigo-200 text-indigo-400 px-5 py-2 rounded-xl text-[10px] font-black">先不複刻</button>
                  </div>
                </div>
              )}

              <div className="space-y-4 mb-10">
                {(currentTaskInMemo.checklist || []).map(item => (
                  <div key={item.id} className="flex items-center gap-5 p-5 bg-slate-50 rounded-2xl group border border-transparent hover:border-indigo-100 hover:bg-white shadow-sm transition-all">
                    <button onClick={() => {
                      const newList = currentTaskInMemo.checklist.map(i => i.id === item.id ? { ...i, completed: !i.completed, actualDoneDate: !i.completed ? formatFullDateTime(new Date()) : null } : i);
                      const progress = newList.length > 0 ? Math.round((newList.filter(i => i.completed).length / newList.length) * 100) : 0;
                      apiPatch('tasks', currentTaskInMemo.id, { checklist: newList, progress });
                    }} className="shrink-0 active:scale-75 transition-transform">{item.completed ? <CheckCircle2 className="w-8 h-8 text-emerald-500 fill-emerald-50" /> : <Square className="w-8 h-8 text-slate-300" />}</button>
                    <div className="flex flex-col flex-1">
                      <span className={`text-base font-bold ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{String(item.text)}</span>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">期限：{item.startDate} ~ {item.dueDate}</span>
                        {item.completed && item.actualDoneDate && (
                          <span className="flex items-center gap-2 text-xs font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                            <Clock className="w-3 h-3" /> 完成於 {item.actualDoneDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 transition-all text-slate-300">
                      <button onClick={() => { setEditingChecklistId(item.id); setNewChecklistItem(item.text); setNewChecklistStartDate(item.startDate || currentTaskInMemo.startDate); setNewChecklistEndDate(item.dueDate || currentTaskInMemo.endDate); }} className="hover:text-indigo-600 p-2.5 transition-all" title="編輯項目"><Pencil className="w-5 h-5" /></button>
                      <button onClick={() => {
                        const newList = currentTaskInMemo.checklist.filter(i => i.id !== item.id);
                        const progress = newList.length > 0 ? Math.round((newList.filter(i => i.completed).length / newList.length) * 100) : 0;
                        apiPatch('tasks', currentTaskInMemo.id, { checklist: newList, progress });
                      }} className="hover:text-rose-500 p-2.5 transition-all" title="刪除項目"><X className="w-5 h-5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`p-8 rounded-3xl border shadow-inner transition-colors ${editingChecklistId ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                {editingChecklistId && (
                  <div className="flex items-center justify-between mb-4 bg-white px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                    <span className="text-xs font-black text-indigo-600 uppercase flex items-center gap-2"><Pencil className="w-4 h-4"/> 正在編輯分解項目...</span>
                    <button onClick={() => { setEditingChecklistId(null); setNewChecklistItem(""); }} className="text-slate-400 hover:text-rose-500 transition-colors p-1"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex flex-col"><label className="text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">子項開始</label><input type="date" min={currentTaskInMemo.startDate} max={currentTaskInMemo.endDate} className="bg-white px-4 py-3 rounded-xl text-sm font-bold border border-slate-200 focus:ring-4 focus:ring-indigo-100" value={newChecklistStartDate} onChange={e => setNewChecklistStartDate(e.target.value)} /></div>
                  <div className="flex flex-col"><label className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">子項截止</label><input type="date" min={currentTaskInMemo.startDate} max={currentTaskInMemo.endDate} className="bg-white px-4 py-3 rounded-xl text-sm font-bold border border-slate-200 focus:ring-4 focus:ring-indigo-100" value={newChecklistEndDate} onChange={e => setNewChecklistEndDate(e.target.value)} /></div>
                </div>
                <div className="flex gap-3 relative"><input type="text" placeholder="描述細項內容..." className="flex-1 bg-white px-5 py-4 rounded-xl text-base font-bold outline-none border border-slate-200 focus:ring-4 focus:ring-indigo-100 transition-all" value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem(); }} /><button onClick={handleAddChecklistItem} className={`${editingChecklistId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900 hover:bg-slate-800'} text-white px-6 rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center font-black`}>{editingChecklistId ? '儲存' : <Plus className="w-6 h-6" />}</button></div>
              </div>
            </div>

            <div className="w-full md:w-[420px] bg-slate-50/50 flex flex-col p-10 overflow-hidden border-l border-slate-100 shadow-inner">
               <h4 className="text-lg font-black mb-8 flex items-center gap-3 tracking-tight"><MessageSquare className="w-6 h-6 text-indigo-400" /> 進度日誌</h4>
               <div className="flex-1 overflow-y-auto space-y-5 mb-8 scrollbar-thin">{logs.filter(l => l.taskId === currentTaskInMemo.id).sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).map(log => (<div key={log.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group/log relative shadow-slate-200/40"><p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">{String(log.text)}</p><div className="flex items-center justify-between mt-3"><span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '傳送中'}{log.updatedAt && " (已編輯)"}</span><div className="flex items-center gap-2"><button onClick={() => handleEditLog(log)} className="opacity-0 group-hover/log:opacity-100 p-1.5 text-slate-300 hover:text-indigo-600 transition-all"><Pencil className="w-4 h-4" /></button><button onClick={() => handleDeleteLog(log.id)} className="opacity-0 group-hover/log:opacity-100 p-1.5 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button></div></div></div>))}</div>
               <div className={`flex flex-col gap-3 p-3 bg-white rounded-2xl border ${editingLogId ? 'border-indigo-400 ring-4 ring-indigo-50 shadow-lg' : 'border-slate-200 shadow-sm'}`}>{editingLogId && (<div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50 rounded-lg"><span className="text-xs font-black text-indigo-600 uppercase">正在編輯日誌...</span><button onClick={() => { setEditingLogId(null); setNewLogText(""); }} className="text-indigo-400 hover:text-rose-500"><X className="w-3 h-3" /></button></div>)}<div className="flex gap-3"><textarea rows="2" placeholder="撰寫回報..." className="flex-1 px-4 py-3 bg-transparent text-sm font-bold outline-none resize-none" value={newLogText} onChange={e => setNewLogText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendLog(); }}}></textarea><button onClick={handleSendLog} className={`px-5 rounded-xl active:scale-90 transition-all shadow-lg self-end mb-1 mr-1 py-4 ${editingLogId ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-white'}`}>{editingLogId ? <CheckIcon className="w-6 h-6" /> : <Send className="w-6 h-6" />}</button></div></div>
            </div>
          </div>
        </div>
      )}

      {/* 建立/編輯任務彈窗 */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={() => setIsTaskModalOpen(false)}>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-12 py-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-2xl font-black">{editingTaskId ? '編輯工作' : '建立新工作'}</h3><button onClick={() => setIsTaskModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-xl transition-all"><X className="w-8 h-8 text-slate-400" /></button></div>
            <form onSubmit={handleSaveTask} className="p-12 space-y-8 scrollbar-thin overflow-y-auto max-h-[80vh]">
              {formError && <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-black animate-in fade-in slide-in-from-top-2"><AlertCircle className="w-5 h-5" /> {formError}</div>}
              <div>
                <label className="text-xs font-black text-slate-400 uppercase mb-3 block tracking-widest">工作標題</label>
                <input className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-base shadow-sm focus:ring-4 focus:ring-indigo-100/50 transition-all" value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} />
              </div>
              
              <div>
                <label className="text-xs font-black text-slate-400 uppercase mb-4 block tracking-widest flex items-center gap-2"><Tag className="w-4 h-4"/> 專案標籤 (可複選)</label>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {tags.map(t => {
                      const isSelected = taskForm.tags.includes(t.name);
                      return (
                        <button 
                          key={t.id} 
                          type="button" 
                          onClick={() => {
                            setTaskForm(prev => ({
                              ...prev,
                              tags: isSelected ? prev.tags.filter(name => name !== t.name) : [...prev.tags, t.name]
                            }));
                          }} 
                          className={`px-5 py-2.5 rounded-xl text-sm font-black border transition-all flex items-center gap-2 ${isSelected ? `${t.color?.active || 'bg-indigo-600'} text-white shadow-lg` : `${t.color?.bg || 'bg-slate-50'} ${t.color?.text || 'text-slate-500'} border-transparent shadow-sm hover:bg-slate-200`}`}
                        >
                          {t.name}
                          {isSelected && <X className="w-4 h-4" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    目前尚無專案標籤，可於主畫面右上角點擊「標籤圖示」進行管理。
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase mb-4 block tracking-widest">執行小組選擇 (單選)</label>
                {groups.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {groups.map(g => (<button key={g.id} type="button" onClick={() => setTaskForm({...taskForm, group: g.name})} className={`px-6 py-3 rounded-xl text-sm font-black border transition-all ${taskForm.group === g.name ? `${g.color?.active || 'bg-indigo-600'} text-white shadow-lg` : `${g.color?.bg || 'bg-slate-50'} ${g.color?.text || 'text-slate-500'} border-transparent shadow-sm`}`}>{g.name}</button>))}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-rose-500 bg-rose-50 p-4 rounded-xl border border-rose-100 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" /> 請先關閉此視窗，並點擊右上角設定建立執行小組。
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-black text-slate-400 uppercase mb-3 block tracking-widest">負責人員 (可多選)</label>
                
                {taskForm.assignee.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {taskForm.assignee.map(a => (
                      <span key={a} className="flex items-center gap-1.5 bg-teal-50 text-teal-700 px-3 py-1.5 rounded-lg text-sm font-bold border border-teal-200">
                        {a}
                        <button type="button" onClick={() => setTaskForm({...taskForm, assignee: taskForm.assignee.filter(name => name !== a)})} className="hover:text-rose-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                   <input
                     className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-base shadow-sm focus:ring-4 focus:ring-indigo-100/50 transition-all"
                     placeholder="輸入人員名稱後，按 Enter 新增..."
                     value={assigneeInput}
                     onChange={e => setAssigneeInput(e.target.value)}
                     onKeyDown={e => {
                       if (e.key === 'Enter') {
                         e.preventDefault(); 
                         handleAddAssignee();
                       }
                     }}
                   />
                   <button
                     type="button"
                     onClick={handleAddAssignee}
                     className="px-6 bg-slate-900 text-white rounded-2xl font-black shadow-md hover:bg-slate-800 transition-all active:scale-95"
                   >
                     新增
                   </button>
                </div>

                {rememberedAssignees.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3 items-center">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">常用記憶：</span>
                    {rememberedAssignees.map(name => {
                      const isSelected = taskForm.assignee.includes(name);
                      return (
                        <button 
                          key={name} 
                          type="button" 
                          onClick={() => {
                            setTaskForm(prev => ({
                              ...prev,
                              assignee: isSelected ? prev.assignee.filter(n => n !== name) : [...prev.assignee, name]
                            }));
                          }} 
                          className={`px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:border-teal-400 hover:text-teal-600 transition-all ${isSelected ? 'ring-2 ring-teal-500 text-teal-700 shadow-sm bg-teal-50' : ''}`}
                        >
                          {name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div><label className="text-xs font-black text-slate-400 mb-3 block tracking-widest">開始日期</label><input type="date" className="w-full p-5 bg-slate-50 border rounded-2xl font-bold text-base shadow-sm" value={taskForm.startDate} onChange={e => setTaskForm({...taskForm, startDate: e.target.value})} /></div>
                <div><label className="text-xs font-black text-slate-400 mb-3 block tracking-widest">截止日期</label><input type="date" className="w-full p-5 bg-slate-50 border rounded-2xl font-bold text-base shadow-sm" value={taskForm.endDate} onChange={e => setTaskForm({...taskForm, endDate: e.target.value})} /></div>
              </div>
              <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 space-y-5 shadow-inner">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-black text-indigo-600 uppercase flex items-center gap-3 tracking-widest">
                    <Repeat className="w-5 h-5" /> 這是例行性循環任務
                  </label>
                  <input type="checkbox" className="w-6 h-6 accent-indigo-600 cursor-pointer shadow-sm" checked={taskForm.isRecurring} onChange={e => setTaskForm({...taskForm, isRecurring: e.target.checked})} />
                </div>
                {taskForm.isRecurring && (
                  <div className="flex items-center gap-4 pt-4 border-t border-indigo-100/50 animate-in slide-in-from-top-2">
                    <span className="text-sm font-black text-indigo-600">每</span>
                    <input 
                      type="number" 
                      min="1" 
                      className="w-20 p-3 bg-white border border-indigo-200 rounded-xl text-center font-bold text-base shadow-sm focus:ring-4 focus:ring-indigo-100 outline-none" 
                      value={taskForm.recurrenceInterval} 
                      onChange={e => setTaskForm({...taskForm, recurrenceInterval: Math.max(1, parseInt(e.target.value) || 1)})} 
                    />
                    <div className="flex bg-white rounded-xl shadow-sm border border-indigo-200 p-1">
                      {RECURRENCE_TYPES.map(rt => (
                        <button
                          key={rt.value}
                          type="button"
                          onClick={() => setTaskForm({...taskForm, recurrenceType: rt.value})}
                          className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${taskForm.recurrenceType === rt.value ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                          {rt.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-sm font-black text-indigo-600">自動建立新任務</span>
                  </div>
                )}
              </div>
              <button disabled={isSubmittingTask} type="submit" className="w-full font-black py-6 rounded-[1.5rem] shadow-xl active:scale-95 transition-all text-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 disabled:bg-slate-300 disabled:shadow-none">{isSubmittingTask ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (editingTaskId ? "確認修改" : "確認任務")}</button>
            </form>
          </div>
        </div>
      )}

      {/* 標籤管理 Modal */}
      {isManagingTags && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={closeTagModal}>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-xl font-black flex items-center gap-3"><Tag className="w-6 h-6 text-indigo-500"/>專案標籤管理</h3><button onClick={closeTagModal}><X className="w-6 h-6 text-slate-400" /></button></div>
            <div className="p-10 space-y-6">
              <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                {tags.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-4 h-4 rounded-full ${t.color?.active || 'bg-slate-400'}`}></div>
                      <span className="font-bold text-slate-700">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingTagId(t.id); setNewTagName(t.name); setNewTagColor(t.color || TAG_COLOR_OPTIONS[1]); }} className="text-slate-400 hover:text-indigo-600 transition-colors p-2 bg-slate-50 hover:bg-indigo-50 rounded-xl" title="編輯標籤">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteTag(t.id, t.name)} className="text-slate-400 hover:text-rose-500 transition-colors p-2 bg-slate-50 hover:bg-rose-50 rounded-xl" title="刪除標籤">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {tags.length === 0 && <p className="text-sm font-bold text-slate-400 text-center py-4">目前尚無標籤</p>}
              </div>
              <form onSubmit={handleSaveTag} className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-200 shadow-inner">
                {editingTagId && (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50 rounded-lg">
                    <span className="text-xs font-black text-indigo-600 uppercase">正在編輯標籤...</span>
                    <button type="button" onClick={() => { setEditingTagId(null); setNewTagName(""); }} className="text-indigo-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <input type="text" placeholder="輸入新標籤名稱..." className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold shadow-sm focus:ring-4 focus:ring-indigo-100/50 transition-all" value={newTagName} onChange={e => setNewTagName(e.target.value)} />
                <div className="grid grid-cols-9 gap-3">
                  {TAG_COLOR_OPTIONS.map(c => (
                    <button key={c.label} type="button" onClick={() => setNewTagColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${c.active} ${newTagColor?.label === c.label ? 'ring-4 ring-indigo-500/20 scale-110 border-white shadow-md' : 'border-transparent opacity-60'}`}></button>
                  ))}
                </div>
                <div className="flex gap-3">
                  {editingTagId && (
                    <button type="button" onClick={() => { setEditingTagId(null); setNewTagName(""); }} className="w-1/3 bg-slate-200 text-slate-600 font-black py-4 rounded-2xl shadow-sm active:scale-95">
                      取消
                    </button>
                  )}
                  <button disabled={isSavingTag || !newTagName.trim()} type="submit" className="flex-1 bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none">
                    {isSavingTag ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingTagId ? "儲存修改" : "新增標籤")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 小組管理 Modal */}
      {isManagingGroups && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={closeGroupModal}>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="text-xl font-black flex items-center gap-3"><Layers className="w-6 h-6 text-indigo-500"/>執行小組管理</h3><button onClick={closeGroupModal}><X className="w-6 h-6 text-slate-400" /></button></div>
            <div className="p-10 space-y-6">
              <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-4 h-4 rounded-full ${g.color?.active || 'bg-slate-400'}`}></div>
                      <span className="font-bold text-slate-700">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingGroupId(g.id); setNewGroupName(g.name); setNewGroupColor(g.color || GROUP_COLOR_OPTIONS[0]); }} className="text-slate-400 hover:text-indigo-600 transition-colors p-2 bg-slate-50 hover:bg-indigo-50 rounded-xl" title="編輯小組">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteGroup(g.id, g.name)} className="text-slate-400 hover:text-rose-500 transition-colors p-2 bg-slate-50 hover:bg-rose-50 rounded-xl" title="刪除小組">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {groups.length === 0 && <p className="text-sm font-bold text-slate-400 text-center py-4">目前尚無小組</p>}
              </div>
              <form onSubmit={handleSaveGroup} className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-200 shadow-inner">
                {editingGroupId && (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50 rounded-lg">
                    <span className="text-xs font-black text-indigo-600 uppercase">正在編輯小組...</span>
                    <button type="button" onClick={() => { setEditingGroupId(null); setNewGroupName(""); }} className="text-indigo-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <input type="text" placeholder="輸入新小組名稱..." className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none font-bold shadow-sm focus:ring-4 focus:ring-indigo-100/50 transition-all" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {GROUP_COLOR_OPTIONS.map(c => (
                    <button key={c.label} type="button" onClick={() => setNewGroupColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${c.active} ${newGroupColor?.label === c.label ? 'ring-4 ring-indigo-500/20 scale-110 border-white shadow-md' : 'border-transparent opacity-60'}`}></button>
                  ))}
                </div>
                <div className="flex gap-3">
                  {editingGroupId && (
                    <button type="button" onClick={() => { setEditingGroupId(null); setNewGroupName(""); }} className="w-1/3 bg-slate-200 text-slate-600 font-black py-4 rounded-2xl shadow-sm active:scale-95">
                      取消
                    </button>
                  )}
                  <button disabled={isSavingGroup || !newGroupName.trim()} type="submit" className="flex-1 bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none">
                    {isSavingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingGroupId ? "儲存修改" : "新增小組成員")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 刪除任務確認 */}
      {taskToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={() => setTaskToDelete(null)}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 shadow-slate-900/50" onClick={(e) => e.stopPropagation()}><div className="p-8 text-center"><div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100"><AlertTriangle className="w-8 h-8" /></div><h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">確定要刪除嗎？</h3><p className="text-sm font-bold text-slate-400 px-4">「{taskToDelete.title}」<br/>刪除後將無法恢復。</p></div><div className="p-6 bg-slate-50 flex gap-3"><button onClick={() => setTaskToDelete(null)} className="flex-1 py-3 rounded-xl font-black text-slate-500 bg-white border border-slate-200 transition-all hover:bg-slate-100">取消</button><button onClick={() => { apiDelete('tasks', taskToDelete.id); logs.filter(l => l.taskId === taskToDelete.id).forEach(l => apiDelete('logs', l.id)); setTaskToDelete(null); }} className="flex-1 py-3 rounded-xl font-black text-white bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-200">確認刪除</button></div></div>
        </div>
      )}

      {/* 新增：圖片燈箱 (Lightbox) */}
      {previewImage && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md transition-all" onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 p-2 text-white/50 hover:text-white transition-colors">
            <X className="w-8 h-8" />
          </button>
          <img src={previewImage} alt="預覽圖片" className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}