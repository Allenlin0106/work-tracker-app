using System.Text.Json.Serialization;

namespace WorkTracker.Client.Models;

public class TaskItem
{
    [JsonPropertyName("id")]                public string  Id                  { get; set; } = "";
    [JsonPropertyName("title")]             public string  Title               { get; set; } = "";
    [JsonPropertyName("group")]             public string? Group               { get; set; }
    [JsonPropertyName("assignee")]          public List<string> Assignee       { get; set; } = [];
    [JsonPropertyName("startDate")]         public string? StartDate           { get; set; }
    [JsonPropertyName("endDate")]           public string? EndDate             { get; set; }
    [JsonPropertyName("progress")]          public int     Progress            { get; set; }
    [JsonPropertyName("isRecurring")]       public bool    IsRecurring         { get; set; }
    [JsonPropertyName("recurrenceType")]    public string? RecurrenceType      { get; set; }
    [JsonPropertyName("recurrenceInterval")]public int     RecurrenceInterval  { get; set; } = 1;
    [JsonPropertyName("tags")]              public List<string> Tags           { get; set; } = [];
    [JsonPropertyName("attachments")]       public List<AttachmentItem> Attachments { get; set; } = [];
    [JsonPropertyName("checklist")]         public List<ChecklistItem>  Checklist   { get; set; } = [];
    [JsonPropertyName("createdAt")]         public DateTime CreatedAt           { get; set; }
    [JsonPropertyName("updatedAt")]         public DateTime UpdatedAt           { get; set; }
}
