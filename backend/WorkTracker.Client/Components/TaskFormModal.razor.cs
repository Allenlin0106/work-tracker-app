using Microsoft.AspNetCore.Components;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Components;

public partial class TaskFormModal
{
    [Inject] AppState  AppState { get; set; } = default!;
    [Inject] ApiService Api     { get; set; } = default!;

    [Parameter] public bool      IsOpen     { get; set; }
    [Parameter] public TaskItem? TaskToEdit { get; set; }   // null = create mode
    [Parameter] public EventCallback OnClose { get; set; }
    [Parameter] public EventCallback OnSaved { get; set; }

    private TaskForm  _taskForm        = DefaultTaskForm();
    private string    _assigneeInput   = "";
    private string    _formError       = "";
    private bool      _isSubmittingTask;
    private string?   _editingTaskId;
    private bool      _wasOpen;

    private IEnumerable<string> RememberedAssignees =>
        AppState.Tasks.SelectMany(t => t.Assignee).Where(a => !string.IsNullOrEmpty(a))
            .GroupBy(a => a).OrderByDescending(g => g.Count()).Take(5).Select(g => g.Key);

    private DateOnly? FormStartDate
    {
        get => DateOnly.TryParse(_taskForm.StartDate, out var d) ? d : null;
        set => _taskForm.StartDate = value?.ToString("yyyy-MM-dd") ?? string.Empty;
    }
    private DateOnly? FormEndDate
    {
        get => DateOnly.TryParse(_taskForm.EndDate, out var d) ? d : null;
        set => _taskForm.EndDate = value?.ToString("yyyy-MM-dd") ?? string.Empty;
    }

    protected override void OnParametersSet()
    {
        if (IsOpen && !_wasOpen)
            Initialize(TaskToEdit);
        _wasOpen = IsOpen;
    }

    private void Initialize(TaskItem? task)
    {
        _formError     = "";
        _assigneeInput = "";
        if (task is null)
        {
            _editingTaskId = null;
            _taskForm      = DefaultTaskForm();
        }
        else
        {
            _editingTaskId = task.Id;
            _taskForm = new TaskForm
            {
                Title              = task.Title,
                Group              = task.Group ?? "",
                Assignee           = task.Assignee.ToList(),
                StartDate          = task.StartDate ?? TaskHelpers.FormatDate(DateTime.Today),
                EndDate            = task.EndDate   ?? TaskHelpers.FormatDate(DateTime.Today.AddDays(7)),
                IsRecurring        = task.IsRecurring,
                RecurrenceType     = task.RecurrenceType ?? "weekly",
                RecurrenceInterval = task.RecurrenceInterval,
                Tags               = task.Tags.Where(tName => AppState.Tags.Any(t => t.Name == tName)).ToList(),
                Attachments        = task.Attachments.ToList()
            };
        }
    }

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
            await OnSaved.InvokeAsync();
        }
        finally { _isSubmittingTask = false; }
    }

    private void AddAssignee()
    {
        var val = _assigneeInput.Trim();
        if (!string.IsNullOrEmpty(val) && !_taskForm.Assignee.Contains(val))
            _taskForm.Assignee.Add(val);
        _assigneeInput = "";
    }

    private static TaskForm DefaultTaskForm() => new()
    {
        StartDate = TaskHelpers.FormatDate(DateTime.Today),
        EndDate   = TaskHelpers.FormatDate(DateTime.Today.AddDays(7)),
    };

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
