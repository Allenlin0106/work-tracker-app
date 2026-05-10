using System.Text.Json.Serialization;

namespace WorkTracker.Client.Models;

public class AttachmentItem
{
    [JsonPropertyName("id")]  public long   Id   { get; set; }
    [JsonPropertyName("type")]public string Type { get; set; } = "link";
    [JsonPropertyName("url")] public string Url  { get; set; } = "";
    [JsonPropertyName("name")]public string Name { get; set; } = "";
}
