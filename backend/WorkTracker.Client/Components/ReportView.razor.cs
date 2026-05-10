using Microsoft.AspNetCore.Components;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Components;

public partial class ReportView
{
    [Inject] AppState AppState { get; set; } = default!;

    [Parameter] public string ViewMode { get; set; } = "weekly";
    [Parameter] public IEnumerable<TaskItem> Tasks { get; set; } = [];
    [Parameter] public string ReportRangeStart { get; set; } = "";
    [Parameter] public string ReportRangeEnd   { get; set; } = "";
    [Parameter] public EventCallback<string> ReportRangeStartChanged { get; set; }
    [Parameter] public EventCallback<string> ReportRangeEndChanged   { get; set; }
    [Parameter] public bool HideTagged { get; set; }
    [Parameter] public EventCallback<bool> HideTaggedChanged { get; set; }
    [Parameter] public string LastMonthLabel { get; set; } = "";
    [Parameter] public EventCallback<string> OnSelectTask { get; set; }

    private DateOnly? ReportStartDate
    {
        get => DateOnly.TryParse(ReportRangeStart, out var d) ? d : null;
        set => _ = ReportRangeStartChanged.InvokeAsync(value?.ToString("yyyy-MM-dd") ?? string.Empty);
    }

    private DateOnly? ReportEndDate
    {
        get => DateOnly.TryParse(ReportRangeEnd, out var d) ? d : null;
        set => _ = ReportRangeEndChanged.InvokeAsync(value?.ToString("yyyy-MM-dd") ?? string.Empty);
    }

    private (DateTime Start, DateTime End)? CurrentViewRange
    {
        get
        {
            if (ViewMode == "weekly")
                return (TaskHelpers.LocalMidnight(ReportRangeStart), TaskHelpers.ParseDate(ReportRangeEnd).Date.AddDays(1).AddSeconds(-1));
            if (ViewMode == "monthly")
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

    private IEnumerable<ReportRow> ReportData
    {
        get
        {
            var range = CurrentViewRange;
            var tasks = HideTagged ? Tasks.Where(t => t.Tags.Count == 0) : Tasks;
            return tasks
                .Select(task =>
                {
                    var taskLogs = AppState.Logs
                        .Where(l => l.TaskId == task.Id && range is not null &&
                            TaskHelpers.TryParseTimestamp(l.Timestamp) is { } ts &&
                            ts >= range.Value.Start && ts <= range.Value.End)
                        .ToList();
                    var taskChecklist = (task.Checklist ?? [])
                        .Where(i => i.Completed && i.ActualDoneDate is not null && range is not null &&
                            TaskHelpers.TryParseDate(i.ActualDoneDate) is { } d &&
                            d >= range.Value.Start && d <= range.Value.End)
                        .ToList();
                    return new ReportRow(task, taskLogs, taskChecklist);
                })
                .Where(r => r.Logs.Count > 0 || r.Checklist.Count > 0);
        }
    }

    private async Task ResetDateRange()
    {
        await ReportRangeStartChanged.InvokeAsync(TaskHelpers.FormatDate(DateTime.Today.AddDays(-7)));
        await ReportRangeEndChanged.InvokeAsync(TaskHelpers.FormatDate(DateTime.Today));
    }

    private record ReportRow(TaskItem Task, List<LogItem> Logs, List<ChecklistItem> Checklist);
}
