using WorkTracker.Client.Models;

namespace WorkTracker.Client.Services;

public static class TaskHelpers
{
    public static string FormatDate(DateTime d) => d.ToString("yyyy-MM-dd");

    public static string FormatFullDateTime(DateTime d) => d.ToString("yyyy-MM-dd HH:mm");

    public static DateTime LocalMidnight(string? s) =>
        string.IsNullOrEmpty(s) ? DateTime.Today :
        DateTime.TryParse(s, out var d) ? d.Date : DateTime.Today;

    public static DateTime ParseDate(string? s) =>
        DateTime.TryParse(s, out var d) ? d : DateTime.Today;

    public static DateTime? TryParseTimestamp(string? s) =>
        string.IsNullOrEmpty(s) ? null : DateTime.TryParse(s, out var d) ? d : null;

    public static DateTime? TryParseDate(string? s) =>
        string.IsNullOrEmpty(s) ? null : DateTime.TryParse(s, out var d) ? d.Date : null;

    public static string DisplayAssignee(List<string> assignee) =>
        assignee.Count > 0 ? string.Join("、", assignee) : "未指派";

    public static string GetTaskStatusValue(TaskItem task, IEnumerable<LogItem> logs)
    {
        var today = DateTime.Today;
        var end   = LocalMidnight(task.EndDate);
        if (task.Progress >= 100) return "done";
        if (end < today)          return "delayed";
        bool active = task.Progress > 0 ||
                      task.Checklist.Any(i => i.Completed) ||
                      logs.Any(l => l.TaskId == task.Id);
        return active ? "doing" : "todo";
    }

    public static (string Label, string Color, string Icon) GetTaskStatus(TaskItem task, IEnumerable<LogItem> logs) =>
        GetTaskStatusValue(task, logs) switch
        {
            "done"    => ("已完成", "bg-emerald-50 text-emerald-600 border-emerald-100", "check-circle-2"),
            "delayed" => ("已逾期", "bg-rose-50 text-rose-600 border-rose-100",         "alert-triangle"),
            "doing"   => ("進行中", "bg-blue-50 text-blue-600 border-blue-100",          "alert-circle"),
            _         => ("未開始", "bg-slate-100 text-slate-500 border-slate-200",      "clock"),
        };
}
