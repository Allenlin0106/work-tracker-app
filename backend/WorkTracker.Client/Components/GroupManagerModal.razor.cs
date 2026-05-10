using Microsoft.AspNetCore.Components;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Components;

public partial class GroupManagerModal
{
    [Inject] AppState  AppState { get; set; } = default!;
    [Inject] ApiService Api     { get; set; } = default!;

    [Parameter] public bool          IsOpen  { get; set; }
    [Parameter] public EventCallback OnClose { get; set; }

    private string?     _editingGroupId;
    private string      _newGroupName  = "";
    private ColorOption _newGroupColor = ColorConstants.GroupColors[0];
    private bool        _isSavingGroup;

    protected override void OnParametersSet()
    {
        if (!IsOpen) ResetGroupForm();
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

    private void ResetGroupForm()
    {
        _editingGroupId = null;
        _newGroupName   = "";
        _newGroupColor  = ColorConstants.GroupColors[0];
    }

    private async Task Close()
    {
        ResetGroupForm();
        await OnClose.InvokeAsync();
    }
}
