using Microsoft.AspNetCore.Components;
using WorkTracker.Client.Models;
using WorkTracker.Client.Services;

namespace WorkTracker.Client.Components;

public partial class TagManagerModal
{
    [Inject] AppState  AppState { get; set; } = default!;
    [Inject] ApiService Api     { get; set; } = default!;

    [Parameter] public bool          IsOpen  { get; set; }
    [Parameter] public EventCallback OnClose { get; set; }

    private string?     _editingTagId;
    private string      _newTagName  = "";
    private ColorOption _newTagColor = ColorConstants.TagColors[0];
    private bool        _isSavingTag;

    protected override void OnParametersSet()
    {
        if (!IsOpen) ResetTagForm();
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

    private void ResetTagForm()
    {
        _editingTagId = null;
        _newTagName   = "";
        _newTagColor  = ColorConstants.TagColors[0];
    }

    private async Task Close()
    {
        ResetTagForm();
        await OnClose.InvokeAsync();
    }
}
