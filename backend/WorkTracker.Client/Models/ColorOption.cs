using System.Text.Json.Serialization;

namespace WorkTracker.Client.Models;

public class ColorOption
{
    [JsonPropertyName("label")] public string Label { get; set; } = "";
    [JsonPropertyName("bg")]    public string Bg    { get; set; } = "";
    [JsonPropertyName("text")]  public string Text  { get; set; } = "";
    [JsonPropertyName("border")]public string Border{ get; set; } = "";
    [JsonPropertyName("active")]public string Active{ get; set; } = "";
}
