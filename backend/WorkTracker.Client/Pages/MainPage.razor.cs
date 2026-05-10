using Microsoft.AspNetCore.Components;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Pages;

public partial class MainPage : IDisposable
{
    [Inject] AppState    AppState { get; set; } = default!;
    [Inject] AuthService Auth     { get; set; } = default!;
    [Inject] ApiService  Api      { get; set; } = default!;
    [Inject] HubService  Hub      { get; set; } = default!;

    // ── UI state ──────────────────────────────────────────────────────────────
    private string    _viewMode   = "list";
    private string    _ganttScale = "week";
    private string    _searchTerm = "";
    private SortCfg   _sortConfig = new("title", "asc");
    private Filters   _filters    = new();
    private string?   _selectedTaskId;
    private bool      _isTaskModalOpen;
    private TaskItem? _taskToEdit;
    private bool      _isManagingGroups;
    private bool      _isManagingTags;
    private TaskItem? _taskToDelete;
    private bool      _hideTaggedInReport;
    private string    _reportRangeStart = TaskHelpers.FormatDate(DateTime.Today.AddDays(-7));
    private string    _reportRangeEnd   = TaskHelpers.FormatDate(DateTime.Today);

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    protected override void OnInitialized()
    {
        AppState.OnChange += OnStateChanged;
    }

    public void Dispose()
    {
        AppState.OnChange -= OnStateChanged;
    }

    private void OnStateChanged() => InvokeAsync(StateHasChanged);

    // ── Computed properties ───────────────────────────────────────────────────
    private TaskItem? SelectedTask => AppState.Tasks.FirstOrDefault(t => t.Id == _selectedTaskId);

    private (DateTime Start, DateTime End)? CurrentViewRange
    {
        get
        {
            if (_viewMode == "weekly")
                return (TaskHelpers.LocalMidnight(_reportRangeStart), TaskHelpers.ParseDate(_reportRangeEnd).Date.AddDays(1).AddSeconds(-1));
            if (_viewMode == "monthly")
            {
                var now       = DateTime.Today;
                int prevYear  = now.Month == 1 ? now.Year - 1 : now.Year;
                int prevMonth = now.Month == 1 ? 12 : now.Month - 1;
                return (new DateTime(prevYear, prevMonth, 1),
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
                var s = TaskHelpers.LocalMidnight(t.StartDate);
                var e = TaskHelpers.LocalMidnight(t.EndDate);
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
                result = result.Where(t => _filters.Statuses.Contains(TaskHelpers.GetTaskStatusValue(t, AppState.Logs)));
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
                list.Count(t => TaskHelpers.GetTaskStatusValue(t, AppState.Logs) == "todo"),
                list.Count(t => TaskHelpers.GetTaskStatusValue(t, AppState.Logs) == "doing"),
                list.Count(t => TaskHelpers.GetTaskStatusValue(t, AppState.Logs) == "done"),
                list.Count(t => TaskHelpers.GetTaskStatusValue(t, AppState.Logs) == "delayed"));
        }
    }

    private IEnumerable<string> AllUniqueAssignees =>
        AppState.Tasks.SelectMany(t => t.Assignee).Where(a => !string.IsNullOrEmpty(a)).Distinct().OrderBy(a => a);

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
    private async Task HandleDeleteTask(TaskItem task)
    {
        await Api.DeleteAsync("tasks", task.Id);
        foreach (var log in AppState.Logs.Where(l => l.TaskId == task.Id).ToList())
            await Api.DeleteAsync("logs", log.Id);
        _taskToDelete   = null;
        _selectedTaskId = null;
    }

    private async Task HandleLogout()
    {
        await Hub.DisconnectAsync();
        await Auth.ClearAsync();
        AppState.Clear();
    }

    // ── Task modal helpers ────────────────────────────────────────────────────
    private void OpenCreateTask()
    {
        _taskToEdit      = null;
        _isTaskModalOpen = true;
    }

    private void OpenEditTask(TaskItem task)
    {
        _taskToEdit      = task;
        _isTaskModalOpen = true;
    }

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
}
