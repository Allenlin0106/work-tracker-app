using WorkTracker.Client.Models;

namespace WorkTracker.Client.Services;

public class AppState
{
    public List<TaskItem>  Tasks  { get; private set; } = [];
    public List<LogItem>   Logs   { get; private set; } = [];
    public List<GroupItem> Groups { get; private set; } = [];
    public List<TagItem>   Tags   { get; private set; } = [];

    public event Action? OnChange;

    public void SetTasks(List<TaskItem> v)   { Tasks  = v; OnChange?.Invoke(); }
    public void SetLogs(List<LogItem> v)     { Logs   = v; OnChange?.Invoke(); }
    public void SetGroups(List<GroupItem> v) { Groups = v; OnChange?.Invoke(); }
    public void SetTags(List<TagItem> v)     { Tags   = v; OnChange?.Invoke(); }

    public void Clear()
    {
        Tasks  = [];
        Logs   = [];
        Groups = [];
        Tags   = [];
        OnChange?.Invoke();
    }
}
