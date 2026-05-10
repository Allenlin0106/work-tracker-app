using Microsoft.JSInterop;

namespace WorkTracker.Client.Services;

public class AuthService
{
    private readonly IJSRuntime _js;
    public string? Token    { get; private set; }
    public string? Username { get; private set; }
    public bool IsAuthenticated => !string.IsNullOrEmpty(Token);
    public event Action? OnChange;

    public AuthService(IJSRuntime js) => _js = js;

    public async Task InitAsync()
    {
        Token    = await _js.InvokeAsync<string?>("localStorageGet", "wt_token");
        Username = await _js.InvokeAsync<string?>("localStorageGet", "wt_username");
        OnChange?.Invoke();
    }

    public async Task SetTokenAsync(string token, string username)
    {
        Token    = token;
        Username = username;
        await _js.InvokeVoidAsync("localStorageSet", "wt_token",    token);
        await _js.InvokeVoidAsync("localStorageSet", "wt_username", username);
        OnChange?.Invoke();
    }

    public async Task ClearAsync()
    {
        Token    = null;
        Username = null;
        await _js.InvokeVoidAsync("localStorageRemove", "wt_token");
        await _js.InvokeVoidAsync("localStorageRemove", "wt_username");
        OnChange?.Invoke();
    }
}
