using System.Text.Json.Serialization;

namespace WorkTracker.Client.Models;

public class GroupItem
{
    [JsonPropertyName("id")]   public string      Id    { get; set; } = "";
    [JsonPropertyName("name")] public string      Name  { get; set; } = "";
    [JsonPropertyName("color")]public ColorOption? Color { get; set; }
}
