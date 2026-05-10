using System.Text.Json.Serialization;

namespace WorkTracker.Client.Models;

public class LogItem
{
    [JsonPropertyName("id")]        public string  Id        { get; set; } = "";
    [JsonPropertyName("taskId")]    public string  TaskId    { get; set; } = "";
    [JsonPropertyName("text")]      public string  Text      { get; set; } = "";
    [JsonPropertyName("userName")]  public string? UserName  { get; set; }
    [JsonPropertyName("timestamp")] public string? Timestamp { get; set; }
    [JsonPropertyName("updatedAt")] public string? UpdatedAt { get; set; }
}
