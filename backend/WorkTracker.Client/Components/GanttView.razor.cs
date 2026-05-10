using Microsoft.AspNetCore.Components;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Components;

public partial class GanttView
{
    [Inject] AppState AppState { get; set; } = default!;

    [Parameter] public string GanttScale { get; set; } = "week";
    [Parameter] public IEnumerable<TaskItem> VisibleTasks { get; set; } = [];
    [Parameter] public EventCallback<string> OnSelectTask { get; set; }

    private HashSet<string> _expandedTasks = [];

    private GanttCfg BuildGanttConfig()
    {
        var now = DateTime.Today;
        double colWidth;
        DateTime start, end;
        List<GanttUnit> units = [];
        List<GanttTopHeader> tops = [];

        if (GanttScale == "day")
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
            var months = units.GroupBy(u => new { u.Date.Year, u.Date.Month });
            foreach (var g in months)
                tops.Add(new($"{g.Key.Year}/{g.Key.Month}", g.Count()));
        }
        else if (GanttScale == "week")
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

        return new GanttCfg(units, tops, start, end, colWidth, GanttScale);
    }

    private double GetGanttPos(string? dateStr, GanttCfg cfg)
    {
        if (dateStr is null) return 0;
        var target  = TaskHelpers.LocalMidnight(dateStr);
        var clamped = target < cfg.Start ? cfg.Start : target;

        if (GanttScale == "month")
        {
            int yearDiff    = clamped.Year  - cfg.Start.Year;
            int monthDiff   = clamped.Month - cfg.Start.Month + yearDiff * 12;
            int daysInMonth = DateTime.DaysInMonth(clamped.Year, clamped.Month);
            double dayOffset = (clamped.Day - 1.0) / daysInMonth;
            return (monthDiff + dayOffset) * cfg.ColWidth;
        }

        double unitDur = GanttScale == "day" ? 86400000.0 : 86400000.0 * 7;
        double offset  = (clamped - cfg.Start).TotalMilliseconds;
        return (offset / unitDur) * cfg.ColWidth;
    }

    private double GetGanttWidth(string? startStr, string? endStr, GanttCfg cfg)
    {
        if (startStr is null || endStr is null) return 0;
        var s = TaskHelpers.LocalMidnight(startStr);
        var e = TaskHelpers.LocalMidnight(endStr);
        var effStart = s < cfg.Start ? cfg.Start : s;
        var effEnd   = e > cfg.End   ? cfg.End   : e;
        if (effEnd < effStart) return 0;

        if (GanttScale == "month")
        {
            double startPos = GetGanttPos(effStart.ToString("yyyy-MM-dd"), cfg);
            var    eNext    = effEnd.AddDays(1);
            double endPos   = GetGanttPos(eNext.ToString("yyyy-MM-dd"), cfg);
            return Math.Max(endPos - startPos, 4);
        }

        double unitDur  = GanttScale == "day" ? 86400000.0 : 86400000.0 * 7;
        double duration = (effEnd - effStart).TotalMilliseconds + 86400000;
        return Math.Max((duration / unitDur) * cfg.ColWidth, 4);
    }

    private IEnumerable<TaskItem> GanttVisibleTasks(GanttCfg cfg) =>
        VisibleTasks.Where(t =>
            TaskHelpers.LocalMidnight(t.StartDate) <= cfg.End &&
            TaskHelpers.LocalMidnight(t.EndDate)   >= cfg.Start);

    private bool CheckIsCurrent(DateTime unitDate, string scale)
    {
        var now = DateTime.Today;
        if (scale == "day")  return unitDate.Date == now;
        if (scale == "week") return now >= unitDate && now < unitDate.AddDays(7);
        return unitDate.Month == now.Month && unitDate.Year == now.Year;
    }

    private record GanttUnit(DateTime Date, string Label, string SubLabel);
    private record GanttTopHeader(string Label, int Span);
    private record GanttCfg(List<GanttUnit> Units, List<GanttTopHeader> TopHeaders, DateTime Start, DateTime End, double ColWidth, string Scale);
}
