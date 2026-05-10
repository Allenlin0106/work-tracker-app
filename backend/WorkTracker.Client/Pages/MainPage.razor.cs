using System.Net.Http.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Pages;

public partial class MainPage : IDisposable
{
    [Inject] AppState    AppState { get; set; } = default!;
    [Inject] AuthService Auth     { get; set; } = default!;
    [Inject] ApiService  Api      { get; set; } = default!;
    [Inject] HubService  Hub      { get; set; } = default!;
    [Inject] IJSRuntime  JS       { get; set; } = default!;
    [Inject] NavigationManager Nav { get; set; } = default!;

    // ── UI state ──────────────────────────────────────────────────────────────
    private string   _viewMode    = "list";
    private string   _ganttScale  = "week";
    private string   _searchTerm  = "";
    private SortCfg  _sortConfig  = new("title", "asc");
    private Filters  _filters     = new();
    private HashSet<string> _expandedTasks = [];
    private string?  _selectedTaskId;
    private string?  _editingTaskId;
    private bool     _isTaskModalOpen;
    private bool     _isManagingGroups;
    private bool     _isManagingTags;
    private string?  _previewImage;
    private TaskItem? _taskToDelete;
    private string?  _editingGroupId;
    private string?  _editingTagId;
    private string?  _editingLogId;
    private string?  _editingChecklistId;
    private bool     _hideTaggedInReport;
    private string   _reportRangeStart = FormatDate(DateTime.Today.AddDays(-7));
    private string   _reportRangeEnd   = FormatDate(DateTime.Today);

    // Task form
    private TaskForm _taskForm = DefaultTaskForm();
    private string   _assigneeInput = "";
    private string   _formError     = "";
    private bool     _isSubmittingTask;

    // Group form
    private string      _newGroupName  = "";
    private ColorOption _newGroupColor = ColorConstants.GroupColors[0];
    private bool        _isSavingGroup;

    // Tag form
    private string      _newTagName  = "";
    private ColorOption _newTagColor = ColorConstants.TagColors[0];
    private bool        _isSavingTag;

    // Checklist form
    private string _newChecklistItem      = "";
    private string _newChecklistStartDate = FormatDate(DateTime.Today);
    private string _newChecklistEndDate   = FormatDate(DateTime.Today);
    private string _checklistError        = "";

    // Log form
    private string _newLogText = "";

    // Link form (detail panel)
    private string _detailLinkName = "";
    private string _detailLinkUrl  = "";

    // Recurrence confirm
    private bool _showRecurConfirm;
    private bool _isRecurProcessing;

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    protected override void OnInitialized()
    {
        AppState.OnChange += OnStateChanged;
    }

    public void Dispose()
    {
        AppState.OnChange -= OnStateChanged;
    }

    private void OnStateChanged()
    {
        // Re-check recurrence confirm for selected task
        var task = SelectedTask;
        _showRecurConfirm = task is { IsRecurring: true } && task.Progress >= 100;
        InvokeAsync(StateHasChanged);
    }

    // ── Computed properties ───────────────────────────────────────────────────
    private TaskItem? SelectedTask => AppState.Tasks.FirstOrDefault(t => t.Id == _selectedTaskId);

    private (DateTime Start, DateTime End)? CurrentViewRange
    {
        get
        {
            if (_viewMode == "weekly")
                return (LocalMidnight(_reportRangeStart), ParseDate(_reportRangeEnd).Date.AddDays(1).AddSeconds(-1));
            if (_viewMode == "monthly")
            {
                var now = DateTime.Today;
                return (new DateTime(now.Year, now.Month == 1 ? now.Year - 1 : now.Year, now.Month == 1 ? 12 : now.Month - 1, 0, 0, 0),
                        new DateTime(now.Year, now.Month, 1).AddSeconds(-1));
            }
            return null;
        }
    }

    private IEnumerable<TaskItem> TasksInRange
    {
        get
        {
            var range = CurrentViewRange;
            if (range is null) return AppState.Tasks;
            return AppState.Tasks.Where(t =>
            {
                var s = LocalMidnight(t.StartDate);
                var e = LocalMidnight(t.EndDate);
                return s <= range.Value.End && e >= range.Value.Start;
            });
        }
    }

    private IEnumerable<TaskItem> VisibleTasks
    {
        get
        {
            var result = (_viewMode is "weekly" or "monthly") ? TasksInRange : AppState.Tasks.AsEnumerable();

            if (_filters.Groups.Count > 0)
                result = result.Where(t => _filters.Groups.Contains(t.Group ?? ""));
            if (_filters.Statuses.Count > 0)
                result = result.Where(t => _filters.Statuses.Contains(GetTaskStatusValue(t)));
            if (_filters.Assignees.Count > 0)
                result = result.Where(t => t.Assignee.Any(a => _filters.Assignees.Contains(a)));
            if (_filters.Tags.Count > 0)
                result = result.Where(t => t.Tags.Any(tag => _filters.Tags.Contains(tag)));
            if (!string.IsNullOrWhiteSpace(_searchTerm))
                result = result.Where(t =>
                    t.Title.Contains(_searchTerm, StringComparison.OrdinalIgnoreCase) ||
                    t.Tags.Any(tag => tag.Contains(_searchTerm, StringComparison.OrdinalIgnoreCase)));

            return _sortConfig.Key switch
            {
                "group" => _sortConfig.Dir == "asc" ? result.OrderBy(t => t.Group) : result.OrderByDescending(t => t.Group),
                _       => _sortConfig.Dir == "asc" ? result.OrderBy(t => t.Title) : result.OrderByDescending(t => t.Title),
            };
        }
    }

    private DashboardStats Stats
    {
        get
        {
            var list = (_viewMode is "list" or "gantt") ? VisibleTasks : TasksInRange;
            return new DashboardStats(
                list.Count(),
                list.Count(t => GetTaskStatusValue(t) == "todo"),
                list.Count(t => GetTaskStatusValue(t) == "doing"),
                list.Count(t => GetTaskStatusValue(t) == "done"),
                list.Count(t => GetTaskStatusValue(t) == "delayed"));
        }
    }

    private IEnumerable<ReportRow> ReportData
    {
        get
        {
            if (_viewMode is not ("weekly" or "monthly")) return [];
            var range   = CurrentViewRange;
            var tasks   = _hideTaggedInReport ? TasksInRange.Where(t => t.Tags.Count == 0) : TasksInRange;
            return tasks
                .Select(task =>
                {
                    var taskLogs = AppState.Logs
                        .Where(l => l.TaskId == task.Id && range is not null &&
                            TryParseTimestamp(l.Timestamp) is { } ts &&
                            ts >= range.Value.Start && ts <= range.Value.End)
                        .ToList();
                    var taskChecklist = (task.Checklist ?? [])
                        .Where(i => i.Completed && i.ActualDoneDate is not null && range is not null &&
                            TryParseDate(i.ActualDoneDate) is { } d &&
                            d >= range.Value.Start && d <= range.Value.End)
                        .ToList();
                    return new ReportRow(task, taskLogs, taskChecklist);
                })
                .Where(r => r.Logs.Count > 0 || r.Checklist.Count > 0);
        }
    }

    private IEnumerable<string> AllUniqueAssignees =>
        AppState.Tasks.SelectMany(t => t.Assignee).Where(a => !string.IsNullOrEmpty(a)).Distinct().OrderBy(a => a);

    private IEnumerable<string> RememberedAssignees =>
        AppState.Tasks.SelectMany(t => t.Assignee).Where(a => !string.IsNullOrEmpty(a))
            .GroupBy(a => a).OrderByDescending(g => g.Count()).Take(5).Select(g => g.Key);

    private IEnumerable<TagItem> ActiveTags =>
        AppState.Tags.Where(t =>
        {
            var related = AppState.Tasks.Where(task => task.Tags.Contains(t.Name)).ToList();
            return related.Count == 0 || related.Any(task => task.Progress < 100);
        });

    private IEnumerable<TagItem> CompletedTags =>
        AppState.Tags.Where(t =>
        {
            var related = AppState.Tasks.Where(task => task.Tags.Contains(t.Name)).ToList();
            return related.Count > 0 && related.All(task => task.Progress >= 100);
        });

    private string LastMonthLabel
    {
        get
        {
            var now = DateTime.Today;
            int y = now.Month == 1 ? now.Year - 1 : now.Year;
            int m = now.Month == 1 ? 12 : now.Month - 1;
            return $"{y} 年 {m} 月";
        }
    }

    // ── Gantt chart ───────────────────────────────────────────────────────────
    private GanttCfg BuildGanttConfig()
    {
        var now = DateTime.Today;
        double colWidth;
        DateTime start, end;
        List<GanttUnit> units = [];
        List<GanttTopHeader> tops = [];

        if (_ganttScale == "day")
        {
            colWidth = 60;
            start = now.AddDays(-14);
            end   = now.AddDays(30);
            var cur = start;
            while (cur <= end)
            {
                units.Add(new(cur, cur.Day.ToString(), cur.DayOfWeek.ToString()[..1]));
                cur = cur.AddDays(1);
            }
            // group by month
            var months = units.GroupBy(u => new { u.Date.Year, u.Date.Month });
            foreach (var g in months)
                tops.Add(new($"{g.Key.Year}/{g.Key.Month}", g.Count()));
        }
        else if (_ganttScale == "week")
        {
            colWidth = 120;
            start = now.AddDays(-((int)now.DayOfWeek == 0 ? 6 : (int)now.DayOfWeek - 1)).AddDays(-28);
            end   = start.AddDays(84);
            var cur = start;
            while (cur <= end)
            {
                var weekEnd = cur.AddDays(6);
                units.Add(new(cur, $"{cur.Month}/{cur.Day}", $"~{weekEnd.Month}/{weekEnd.Day}"));
                cur = cur.AddDays(7);
            }
            var months2 = units.GroupBy(u => new { u.Date.Year, u.Date.Month });
            foreach (var g in months2)
                tops.Add(new($"{g.Key.Year}/{g.Key.Month}", g.Count()));
        }
        else // month
        {
            colWidth = 80;
            start = new DateTime(now.Year, now.Month, 1).AddMonths(-3);
            end   = start.AddMonths(18);
            var cur = start;
            while (cur < end)
            {
                units.Add(new(cur, cur.Month.ToString(), cur.Year.ToString()));
                cur = cur.AddMonths(1);
            }
            var years = units.GroupBy(u => u.Date.Year);
            foreach (var g in years)
                tops.Add(new(g.Key.ToString(), g.Count()));
        }

        return new GanttCfg(units, tops, start, end, colWidth, _ganttScale);
    }

    private double GetGanttPos(string? dateStr, GanttCfg cfg)
    {
        if (dateStr is null) return 0;
        var target  = LocalMidnight(dateStr);
        var clamped = target < cfg.Start ? cfg.Start : target;

        if (_ganttScale == "month")
        {
            int yearDiff  = clamped.Year  - cfg.Start.Year;
            int monthDiff = clamped.Month - cfg.Start.Month + yearDiff * 12;
            int daysInMonth = DateTime.DaysInMonth(clamped.Year, clamped.Month);
            double dayOffset = (clamped.Day - 1.0) / daysInMonth;
            return (monthDiff + dayOffset) * cfg.ColWidth;
        }

        double unitDur = _ganttScale == "day" ? 86400000.0 : 86400000.0 * 7;
        double offset  = (clamped - cfg.Start).TotalMilliseconds;
        return (offset / unitDur) * cfg.ColWidth;
    }

    private double GetGanttWidth(string? startStr, string? endStr, GanttCfg cfg)
    {
        if (startStr is null || endStr is null) return 0;
        var s = LocalMidnight(startStr);
        var e = LocalMidnight(endStr);
        var effStart = s < cfg.Start ? cfg.Start : s;
        var effEnd   = e > cfg.End   ? cfg.End   : e;
        if (effEnd < effStart) return 0;

        if (_ganttScale == "month")
        {
            double startPos = GetGanttPos(effStart.ToString("yyyy-MM-dd"), cfg);
            var    eNext    = effEnd.AddDays(1);
            double endPos   = GetGanttPos(eNext.ToString("yyyy-MM-dd"), cfg);
            return Math.Max(endPos - startPos, 4);
        }

        double unitDur  = _ganttScale == "day" ? 86400000.0 : 86400000.0 * 7;
        double duration = (effEnd - effStart).TotalMilliseconds + 86400000;
        return Math.Max((duration / unitDur) * cfg.ColWidth, 4);
    }

    private IEnumerable<TaskItem> GanttVisibleTasks(GanttCfg cfg) =>
        VisibleTasks.Where(t =>
            LocalMidnight(t.StartDate) <= cfg.End &&
            LocalMidnight(t.EndDate)   >= cfg.Start);

    private bool CheckIsCurrent(DateTime unitDate, string scale)
    {
        var now = DateTime.Today;
        if (scale == "day")   return unitDate.Date == now;
        if (scale == "week")  return now >= unitDate && now < unitDate.AddDays(7);
        return unitDate.Month == now.Month && unitDate.Year == now.Year;
    }

    // ── Task status ───────────────────────────────────────────────────────────
    private string GetTaskStatusValue(TaskItem task)
    {
        var today = DateTime.Today;
        var end   = LocalMidnight(task.EndDate);
        if (task.Progress >= 100) return "done";
        if (end < today)          return "delayed";
        bool active = task.Progress > 0 ||
                      task.Checklist.Any(i => i.Completed) ||
                      AppState.Logs.Any(l => l.TaskId == task.Id);
        return active ? "doing" : "todo";
    }

    private (string Label, string Color, string Icon) GetTaskStatus(TaskItem task)
    {
        return GetTaskStatusValue(task) switch
        {
            "done"    => ("已完成", "bg-emerald-50 text-emerald-600 border-emerald-100", "check-circle-2"),
            "delayed" => ("已逾期", "bg-rose-50 text-rose-600 border-rose-100",         "alert-triangle"),
            "doing"   => ("進行中", "bg-blue-50 text-blue-600 border-blue-100",          "alert-circle"),
            _         => ("未開始", "bg-slate-100 text-slate-500 border-slate-200",      "clock"),
        };
    }

    // ── Filter / sort helpers ─────────────────────────────────────────────────
    private void ToggleFilter(string type, string value)
    {
        var list = type switch
        {
            "groups"    => _filters.Groups,
            "statuses"  => _filters.Statuses,
            "assignees" => _filters.Assignees,
            "tags"      => _filters.Tags,
            _           => null
        };
        if (list is null) return;
        if (list.Contains(value)) list.Remove(value); else list.Add(value);
    }

    private void HandleSort(string key)
    {
        _sortConfig = _sortConfig.Key == key && _sortConfig.Dir == "asc"
            ? new(key, "desc") : new(key, "asc");
    }

    // ── CRUD operations ───────────────────────────────────────────────────────
    private async Task HandleSaveTask()
    {
        if (string.IsNullOrWhiteSpace(_taskForm.Title)) { _formError = "請填寫工作標題"; return; }
        if (string.IsNullOrWhiteSpace(_taskForm.Group)) { _formError = "請選擇執行小組"; return; }

        _isSubmittingTask = true;
        _formError = "";
        try
        {
            if (_editingTaskId is not null)
                await Api.PatchAsync("tasks", _editingTaskId, _taskForm.ToPayload());
            else
                await Api.PostAsync("tasks", _taskForm.ToPayload());
            _isTaskModalOpen = false;
            _editingTaskId   = null;
        }
        finally { _isSubmittingTask = false; }
    }

    private async Task HandleDeleteTask(TaskItem task)
    {
        await Api.DeleteAsync("tasks", task.Id);
        foreach (var log in AppState.Logs.Where(l => l.TaskId == task.Id).ToList())
            await Api.DeleteAsync("logs", log.Id);
        _taskToDelete    = null;
        _selectedTaskId  = null;
    }

    private async Task HandleSaveGroup()
    {
        if (string.IsNullOrWhiteSpace(_newGroupName)) return;
        _isSavingGroup = true;
        try
        {
            if (_editingGroupId is not null)
                await Api.PatchAsync("groups", _editingGroupId, new { name = _newGroupName, color = _newGroupColor });
            else
                await Api.PostAsync("groups", new { name = _newGroupName, color = _newGroupColor });
            ResetGroupForm();
        }
        finally { _isSavingGroup = false; }
    }

    private async Task HandleDeleteGroup(string groupId, string groupName)
    {
        foreach (var t in AppState.Tasks.Where(t => t.Group == groupName).ToList())
            await Api.PatchAsync("tasks", t.Id, new { group = (string?)null });
        await Api.DeleteAsync("groups", groupId);
        if (_editingGroupId == groupId) ResetGroupForm();
    }

    private async Task HandleSaveTag()
    {
        if (string.IsNullOrWhiteSpace(_newTagName)) return;
        _isSavingTag = true;
        try
        {
            if (_editingTagId is not null)
                await Api.PatchAsync("tags", _editingTagId, new { name = _newTagName, color = _newTagColor });
            else
                await Api.PostAsync("tags", new { name = _newTagName, color = _newTagColor });
            ResetTagForm();
        }
        finally { _isSavingTag = false; }
    }

    private async Task HandleDeleteTag(string tagId, string tagName)
    {
        foreach (var t in AppState.Tasks.Where(t => t.Tags.Contains(tagName)).ToList())
        {
            var newTags = t.Tags.Where(n => n != tagName).ToList();
            await Api.PatchAsync("tasks", t.Id, new { tags = newTags });
        }
        await Api.DeleteAsync("tags", tagId);
        if (_editingTagId == tagId) ResetTagForm();
    }

    private async Task HandleSendLog()
    {
        if (string.IsNullOrWhiteSpace(_newLogText) || _selectedTaskId is null) return;
        if (_editingLogId is not null)
        {
            await Api.PatchAsync("logs", _editingLogId, new { text = _newLogText });
            _editingLogId = null;
        }
        else
        {
            await Api.PostAsync("logs", new
            {
                taskId    = _selectedTaskId,
                text      = _newLogText,
                userName  = "User",
                timestamp = DateTime.UtcNow.ToString("o")
            });
        }
        _newLogText = "";
    }

    private async Task HandleDeleteLog(string logId)
    {
        await Api.DeleteAsync("logs", logId);
        if (_editingLogId == logId) { _editingLogId = null; _newLogText = ""; }
    }

    private async Task HandleAddChecklistItem()
    {
        _checklistError = "";
        if (string.IsNullOrWhiteSpace(_newChecklistItem)) { _checklistError = "請輸入內容"; return; }
        var task = SelectedTask;
        if (task is null) return;

        List<ChecklistItem> newList;
        if (_editingChecklistId is not null)
        {
            newList = task.Checklist.Select(i => i.Id.ToString() == _editingChecklistId
                ? i with { Text = _newChecklistItem.Trim(), StartDate = _newChecklistStartDate, DueDate = _newChecklistEndDate }
                : i).ToList();
            _editingChecklistId = null;
        }
        else
        {
            var newItem = new ChecklistItem
            {
                Id        = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Text      = _newChecklistItem.Trim(),
                StartDate = _newChecklistStartDate,
                DueDate   = _newChecklistEndDate
            };
            newList = [..task.Checklist, newItem];
        }

        int progress = newList.Count > 0 ? (int)Math.Round(newList.Count(i => i.Completed) * 100.0 / newList.Count) : 0;
        await Api.PatchAsync("tasks", task.Id, new { checklist = newList, progress });
        _newChecklistItem = "";
    }

    private async Task ToggleChecklistItem(TaskItem task, ChecklistItem item)
    {
        var newList = task.Checklist.Select(i => i.Id == item.Id
            ? i with { Completed = !i.Completed, ActualDoneDate = !i.Completed ? FormatFullDateTime(DateTime.Now) : null }
            : i).ToList();
        int progress = newList.Count > 0 ? (int)Math.Round(newList.Count(i => i.Completed) * 100.0 / newList.Count) : 0;
        await Api.PatchAsync("tasks", task.Id, new { checklist = newList, progress });
    }

    private async Task DeleteChecklistItem(TaskItem task, long itemId)
    {
        var newList  = task.Checklist.Where(i => i.Id != itemId).ToList();
        int progress = newList.Count > 0 ? (int)Math.Round(newList.Count(i => i.Completed) * 100.0 / newList.Count) : 0;
        await Api.PatchAsync("tasks", task.Id, new { checklist = newList, progress });
    }

    private async Task HandleDetailAddLink(TaskItem task)
    {
        if (string.IsNullOrWhiteSpace(_detailLinkUrl)) return;
        var url = _detailLinkUrl.Trim();
        if (!url.StartsWith("http://") && !url.StartsWith("https://")) url = "https://" + url;
        var att = new AttachmentItem { Id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Type = "link", Url = url, Name = string.IsNullOrWhiteSpace(_detailLinkName) ? url : _detailLinkName.Trim() };
        var updated = task.Attachments.Append(att).ToList();
        await Api.PatchAsync("tasks", task.Id, new { attachments = updated });
        _detailLinkName = _detailLinkUrl = "";
    }

    private async Task HandleDetailDeleteAttachment(TaskItem task, long attId)
    {
        var updated = task.Attachments.Where(a => a.Id != attId).ToList();
        await Api.PatchAsync("tasks", task.Id, new { attachments = updated });
    }

    private async Task HandleImageUpload(Microsoft.AspNetCore.Components.Forms.InputFileChangeEventArgs e, TaskItem task)
    {
        var file = e.File;
        using var stream = file.OpenReadStream(5 * 1024 * 1024);
        using var ms     = new MemoryStream();
        await stream.CopyToAsync(ms);
        var dataUrl    = $"data:{file.ContentType};base64,{Convert.ToBase64String(ms.ToArray())}";
        var compressed = await JS.InvokeAsync<string>("compressImageFromDataUrl", dataUrl);
        var att        = new AttachmentItem { Id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Type = "image", Url = compressed, Name = file.Name };
        var updated    = task.Attachments.Append(att).ToList();
        await Api.PatchAsync("tasks", task.Id, new { attachments = updated });
    }

    private async Task HandleRemoveTagFromTask(TaskItem task, string tagName)
    {
        var newTags = task.Tags.Where(n => n != tagName).ToList();
        await Api.PatchAsync("tasks", task.Id, new { tags = newTags });
    }

    private async Task ExecuteRecurrence(TaskItem task)
    {
        _isRecurProcessing = true;
        try
        {
            await Api.PatchAsync("tasks", task.Id, new { progress = 100 });
            int    interval = task.RecurrenceInterval;
            string type     = task.RecurrenceType ?? "weekly";

            DateTime ShiftDate(string? d)
            {
                var dt = LocalMidnight(d);
                return type switch
                {
                    "daily"   => dt.AddDays(interval),
                    "monthly" => dt.AddMonths(interval),
                    _         => dt.AddDays(interval * 7),
                };
            }

            var nextChecklist = task.Checklist.Select(i => new ChecklistItem
            {
                Id             = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + new Random().Next(10000),
                Text           = i.Text,
                Completed      = false,
                ActualDoneDate = null,
                StartDate      = FormatDate(ShiftDate(i.StartDate ?? i.DueDate)),
                DueDate        = FormatDate(ShiftDate(i.DueDate))
            }).ToList();

            await Api.PostAsync("tasks", new
            {
                title              = task.Title,
                group              = task.Group,
                assignee           = task.Assignee,
                startDate          = FormatDate(ShiftDate(task.StartDate)),
                endDate            = FormatDate(ShiftDate(task.EndDate)),
                progress           = 0,
                isRecurring        = task.IsRecurring,
                recurrenceType     = task.RecurrenceType,
                recurrenceInterval = task.RecurrenceInterval,
                tags               = task.Tags,
                checklist          = nextChecklist,
                attachments        = task.Attachments
            });

            _showRecurConfirm = false;
            _selectedTaskId   = null;
        }
        finally { _isRecurProcessing = false; }
    }

    private async Task HandleLogout()
    {
        await Hub.DisconnectAsync();
        await Auth.ClearAsync();
        AppState.Clear();
    }

    // ── Form reset helpers ────────────────────────────────────────────────────
    private void OpenCreateTask()
    {
        _editingTaskId   = null;
        _taskForm        = DefaultTaskForm();
        _assigneeInput   = "";
        _formError       = "";
        _isTaskModalOpen = true;
    }

    private void OpenEditTask(TaskItem task)
    {
        _editingTaskId = task.Id;
        _taskForm = new TaskForm
        {
            Title              = task.Title,
            Group              = task.Group ?? "",
            Assignee           = task.Assignee.ToList(),
            StartDate          = task.StartDate ?? FormatDate(DateTime.Today),
            EndDate            = task.EndDate   ?? FormatDate(DateTime.Today.AddDays(7)),
            IsRecurring        = task.IsRecurring,
            RecurrenceType     = task.RecurrenceType ?? "weekly",
            RecurrenceInterval = task.RecurrenceInterval,
            Tags               = task.Tags.Where(tName => AppState.Tags.Any(t => t.Name == tName)).ToList(),
            Attachments        = task.Attachments.ToList()
        };
        _assigneeInput   = "";
        _formError       = "";
        _isTaskModalOpen = true;
    }

    private void AddAssignee()
    {
        var val = _assigneeInput.Trim();
        if (!string.IsNullOrEmpty(val) && !_taskForm.Assignee.Contains(val))
            _taskForm.Assignee.Add(val);
        _assigneeInput = "";
    }

    private void ResetGroupForm()
    {
        _editingGroupId = null;
        _newGroupName   = "";
        _newGroupColor  = ColorConstants.GroupColors[0];
    }

    private void ResetTagForm()
    {
        _editingTagId = null;
        _newTagName   = "";
        _newTagColor  = ColorConstants.TagColors[0];
    }

    // ── Date helpers ──────────────────────────────────────────────────────────
    private static string FormatDate(DateTime d) =>
        d.ToString("yyyy-MM-dd");

    private static string FormatFullDateTime(DateTime d) =>
        d.ToString("yyyy-MM-dd HH:mm");

    private static DateTime LocalMidnight(string? s)
    {
        if (string.IsNullOrEmpty(s)) return DateTime.Today;
        return DateTime.TryParse(s, out var d) ? d.Date : DateTime.Today;
    }

    private static DateTime ParseDate(string? s) =>
        DateTime.TryParse(s, out var d) ? d : DateTime.Today;

    private static DateTime? TryParseTimestamp(string? s) =>
        string.IsNullOrEmpty(s) ? null : DateTime.TryParse(s, out var d) ? d : null;

    private static DateTime? TryParseDate(string? s) =>
        string.IsNullOrEmpty(s) ? null : DateTime.TryParse(s, out var d) ? d.Date : null;

    private static string DisplayAssignee(List<string> assignee) =>
        assignee.Count > 0 ? string.Join("、", assignee) : "未指派";

    // ── Default form ──────────────────────────────────────────────────────────
    private static TaskForm DefaultTaskForm() => new()
    {
        StartDate = FormatDate(DateTime.Today),
        EndDate   = FormatDate(DateTime.Today.AddDays(7)),
    };

    // ── Inner types ───────────────────────────────────────────────────────────
    private record SortCfg(string Key, string Dir);
    private class Filters
    {
        public HashSet<string> Groups    { get; } = [];
        public HashSet<string> Statuses  { get; } = [];
        public HashSet<string> Assignees { get; } = [];
        public HashSet<string> Tags      { get; } = [];
    }
    private record DashboardStats(int Total, int Todo, int Doing, int Done, int Delayed);
    private record ReportRow(TaskItem Task, List<LogItem> Logs, List<ChecklistItem> Checklist);
    private record GanttUnit(DateTime Date, string Label, string SubLabel);
    private record GanttTopHeader(string Label, int Span);
    private record GanttCfg(List<GanttUnit> Units, List<GanttTopHeader> TopHeaders, DateTime Start, DateTime End, double ColWidth, string Scale);

    private class TaskForm
    {
        public string Title              { get; set; } = "";
        public string Group              { get; set; } = "";
        public List<string> Assignee     { get; set; } = [];
        public string StartDate          { get; set; } = "";
        public string EndDate            { get; set; } = "";
        public bool   IsRecurring        { get; set; }
        public string RecurrenceType     { get; set; } = "weekly";
        public int    RecurrenceInterval { get; set; } = 1;
        public List<string> Tags         { get; set; } = [];
        public List<AttachmentItem> Attachments { get; set; } = [];

        public object ToPayload() => new
        {
            title              = Title,
            group              = Group,
            assignee           = Assignee,
            startDate          = StartDate,
            endDate            = EndDate,
            isRecurring        = IsRecurring,
            recurrenceType     = RecurrenceType,
            recurrenceInterval = RecurrenceInterval,
            tags               = Tags,
            attachments        = Attachments
        };
    }
}
