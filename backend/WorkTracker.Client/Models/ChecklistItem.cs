using System.Text.Json.Serialization;

namespace WorkTracker.Client.Models;

public class ChecklistItem
{
    [JsonPropertyName("id")]            public long   Id             { get; set; }
    [JsonPropertyName("text")]          public string Text           { get; set; } = "";
    [JsonPropertyName("completed")]     public bool   Completed      { get; set; }
    [JsonPropertyName("startDate")]     public string? StartDate     { get; set; }
    [JsonPropertyName("dueDate")]       public string? DueDate       { get; set; }
    [JsonPropertyName("actualDoneDate")]public string? ActualDoneDate{ get; set; }
}
