using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.JSInterop;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Components;

public partial class TaskDetailPanel : IDisposable
{
    [Inject] AppState  AppState { get; set; } = default!;
    [Inject] ApiService Api     { get; set; } = default!;
    [Inject] IJSRuntime JS      { get; set; } = default!;

    [Parameter] public TaskItem?     Task    { get; set; }
    [Parameter] public EventCallback OnClose { get; set; }

    private string?  _editingChecklistId;
    private string   _newChecklistItem      = "";
    private string   _newChecklistStartDate = TaskHelpers.FormatDate(DateTime.Today);
    private string   _newChecklistEndDate   = TaskHelpers.FormatDate(DateTime.Today);
    private string   _checklistError        = "";
    private string   _newLogText            = "";
    private string?  _editingLogId;
    private string   _detailLinkName        = "";
    private string   _detailLinkUrl         = "";
    private bool     _showRecurConfirm;
    private bool     _isRecurProcessing;
    private string?  _previewImage;
    private string?  _prevTaskId;

    private DateOnly? ChecklistStart
    {
        get => DateOnly.TryParse(_newChecklistStartDate, out var d) ? d : null;
        set => _newChecklistStartDate = value?.ToString("yyyy-MM-dd") ?? string.Empty;
    }
    private DateOnly? ChecklistEnd
    {
        get => DateOnly.TryParse(_newChecklistEndDate, out var d) ? d : null;
        set => _newChecklistEndDate = value?.ToString("yyyy-MM-dd") ?? string.Empty;
    }

    protected override void OnInitialized()
    {
        AppState.OnChange += OnAppStateChanged;
    }

    public void Dispose()
    {
        AppState.OnChange -= OnAppStateChanged;
    }

    private void OnAppStateChanged()
    {
        if (Task is { IsRecurring: true } && Task.Progress >= 100)
            _showRecurConfirm = true;
        InvokeAsync(StateHasChanged);
    }

    protected override void OnParametersSet()
    {
        if (Task?.Id != _prevTaskId)
        {
            _editingChecklistId = null;
            _newChecklistItem   = "";
            _newLogText         = "";
            _editingLogId       = null;
            _detailLinkName     = "";
            _detailLinkUrl      = "";
            _previewImage       = null;
            _showRecurConfirm   = Task is { IsRecurring: true } && Task.Progress >= 100;
            _prevTaskId         = Task?.Id;
        }
    }

    private async Task HandleAddChecklistItem()
    {
        _checklistError = "";
        if (string.IsNullOrWhiteSpace(_newChecklistItem)) { _checklistError = "請輸入內容"; return; }
        if (Task is null) return;

        List<ChecklistItem> newList;
        if (_editingChecklistId is not null)
        {
            newList = Task.Checklist.Select(i => i.Id.ToString() == _editingChecklistId
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
            newList = [..Task.Checklist, newItem];
        }

        int progress = newList.Count > 0 ? (int)Math.Round(newList.Count(i => i.Completed) * 100.0 / newList.Count) : 0;
        await Api.PatchAsync("tasks", Task.Id, new { checklist = newList, progress });
        _newChecklistItem = "";
    }

    private async Task ToggleChecklistItem(ChecklistItem item)
    {
        if (Task is null) return;
        var newList = Task.Checklist.Select(i => i.Id == item.Id
            ? i with { Completed = !i.Completed, ActualDoneDate = !i.Completed ? TaskHelpers.FormatFullDateTime(DateTime.Now) : null }
            : i).ToList();
        int progress = newList.Count > 0 ? (int)Math.Round(newList.Count(i => i.Completed) * 100.0 / newList.Count) : 0;
        await Api.PatchAsync("tasks", Task.Id, new { checklist = newList, progress });
    }

    private async Task DeleteChecklistItem(long itemId)
    {
        if (Task is null) return;
        var newList  = Task.Checklist.Where(i => i.Id != itemId).ToList();
        int progress = newList.Count > 0 ? (int)Math.Round(newList.Count(i => i.Completed) * 100.0 / newList.Count) : 0;
        await Api.PatchAsync("tasks", Task.Id, new { checklist = newList, progress });
    }

    private async Task HandleSendLog()
    {
        if (string.IsNullOrWhiteSpace(_newLogText) || Task is null) return;
        if (_editingLogId is not null)
        {
            await Api.PatchAsync("logs", _editingLogId, new { text = _newLogText });
            _editingLogId = null;
        }
        else
        {
            await Api.PostAsync("logs", new
            {
                taskId    = Task.Id,
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

    private async Task HandleDetailAddLink()
    {
        if (Task is null || string.IsNullOrWhiteSpace(_detailLinkUrl)) return;
        var url = _detailLinkUrl.Trim();
        if (!url.StartsWith("http://") && !url.StartsWith("https://")) url = "https://" + url;
        var att = new AttachmentItem
        {
            Id   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Type = "link",
            Url  = url,
            Name = string.IsNullOrWhiteSpace(_detailLinkName) ? url : _detailLinkName.Trim()
        };
        var updated = Task.Attachments.Append(att).ToList();
        await Api.PatchAsync("tasks", Task.Id, new { attachments = updated });
        _detailLinkName = _detailLinkUrl = "";
    }

    private async Task HandleDetailDeleteAttachment(long attId)
    {
        if (Task is null) return;
        var updated = Task.Attachments.Where(a => a.Id != attId).ToList();
        await Api.PatchAsync("tasks", Task.Id, new { attachments = updated });
    }

    private async Task HandleImageUpload(InputFileChangeEventArgs e)
    {
        if (Task is null) return;
        var file = e.File;
        using var stream = file.OpenReadStream(5 * 1024 * 1024);
        using var ms     = new MemoryStream();
        await stream.CopyToAsync(ms);
        var dataUrl    = $"data:{file.ContentType};base64,{Convert.ToBase64String(ms.ToArray())}";
        var compressed = await JS.InvokeAsync<string>("compressImageFromDataUrl", dataUrl);
        var att        = new AttachmentItem { Id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Type = "image", Url = compressed, Name = file.Name };
        var updated    = Task.Attachments.Append(att).ToList();
        await Api.PatchAsync("tasks", Task.Id, new { attachments = updated });
    }

    private async Task HandleRemoveTagFromTask(string tagName)
    {
        if (Task is null) return;
        var newTags = Task.Tags.Where(n => n != tagName).ToList();
        await Api.PatchAsync("tasks", Task.Id, new { tags = newTags });
    }

    private async Task ExecuteRecurrence()
    {
        if (Task is null) return;
        _isRecurProcessing = true;
        try
        {
            await Api.PatchAsync("tasks", Task.Id, new { progress = 100 });
            int    interval = Task.RecurrenceInterval;
            string type     = Task.RecurrenceType ?? "weekly";

            DateTime ShiftDate(string? d)
            {
                var dt = TaskHelpers.LocalMidnight(d);
                return type switch
                {
                    "daily"   => dt.AddDays(interval),
                    "monthly" => dt.AddMonths(interval),
                    _         => dt.AddDays(interval * 7),
                };
            }

            var nextChecklist = Task.Checklist.Select(i => new ChecklistItem
            {
                Id             = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + new Random().Next(10000),
                Text           = i.Text,
                Completed      = false,
                ActualDoneDate = null,
                StartDate      = TaskHelpers.FormatDate(ShiftDate(i.StartDate ?? i.DueDate)),
                DueDate        = TaskHelpers.FormatDate(ShiftDate(i.DueDate))
            }).ToList();

            await Api.PostAsync("tasks", new
            {
                title              = Task.Title,
                group              = Task.Group,
                assignee           = Task.Assignee,
                startDate          = TaskHelpers.FormatDate(ShiftDate(Task.StartDate)),
                endDate            = TaskHelpers.FormatDate(ShiftDate(Task.EndDate)),
                progress           = 0,
                isRecurring        = Task.IsRecurring,
                recurrenceType     = Task.RecurrenceType,
                recurrenceInterval = Task.RecurrenceInterval,
                tags               = Task.Tags,
                checklist          = nextChecklist,
                attachments        = Task.Attachments
            });

            _showRecurConfirm = false;
            await OnClose.InvokeAsync();
        }
        finally { _isRecurProcessing = false; }
    }
}
