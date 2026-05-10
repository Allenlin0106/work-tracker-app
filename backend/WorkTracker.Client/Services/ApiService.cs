using System.Net.Http.Json;

namespace WorkTracker.Client.Services;

public class ApiService
{
    private readonly HttpClient _http;
    private readonly AuthService _auth;

    public ApiService(HttpClient http, AuthService auth)
    {
        _http = http;
        _auth = auth;
    }

    private HttpRequestMessage Req(HttpMethod method, string url)
    {
        var msg = new HttpRequestMessage(method, url);
        if (!string.IsNullOrEmpty(_auth.Token))
            msg.Headers.Authorization = new("Bearer", _auth.Token);
        return msg;
    }

    public async Task<T?> GetAsync<T>(string col)
    {
        using var req = Req(HttpMethod.Get, $"api/{col}");
        var resp = await _http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<T>();
    }

    public async Task<HttpResponseMessage> PostAsync(string col, object data)
    {
        using var req = Req(HttpMethod.Post, $"api/{col}");
        req.Content = JsonContent.Create(data);
        return await _http.SendAsync(req);
    }

    public async Task<HttpResponseMessage> PatchAsync(string col, string id, object data)
    {
        using var req = Req(HttpMethod.Patch, $"api/{col}/{id}");
        req.Content = JsonContent.Create(data);
        return await _http.SendAsync(req);
    }

    public async Task<HttpResponseMessage> DeleteAsync(string col, string id)
    {
        using var req = Req(HttpMethod.Delete, $"api/{col}/{id}");
        return await _http.SendAsync(req);
    }

    // 認證專用 (不帶 JWT)
    public async Task<HttpResponseMessage> PostAuthAsync(string path, object data)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"api/auth/{path}")
        {
            Content = JsonContent.Create(data)
        };
        return await _http.SendAsync(req);
    }

    public async Task<HttpResponseMessage> GetAuthStatusAsync()
        => await _http.GetAsync("api/auth/status");
}
