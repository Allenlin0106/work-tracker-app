using Microsoft.AspNetCore.SignalR.Client;
using WorkTracker.Client.Models;

namespace WorkTracker.Client.Services;

public class HubService : IAsyncDisposable
{
    private readonly AuthService _auth;
    private readonly AppState    _state;
    private HubConnection?       _conn;

    public HubService(AuthService auth, AppState state)
    {
        _auth  = auth;
        _state = state;
    }

    public async Task ConnectAsync(string baseUrl)
    {
        if (_conn is not null)
        {
            await _conn.DisposeAsync();
            _conn = null;
        }

        _conn = new HubConnectionBuilder()
            .WithUrl(new Uri(new Uri(baseUrl), "hubs/tracker"), options =>
            {
                options.AccessTokenProvider = () => Task.FromResult<string?>(_auth.Token);
            })
            .WithAutomaticReconnect()
            .Build();

        _conn.On<List<TaskItem>>("tasks:updated",   _state.SetTasks);
        _conn.On<List<LogItem>>("logs:updated",     _state.SetLogs);
        _conn.On<List<GroupItem>>("groups:updated", _state.SetGroups);
        _conn.On<List<TagItem>>("tags:updated",     _state.SetTags);

        await _conn.StartAsync();
    }

    public async Task DisconnectAsync()
    {
        if (_conn is not null)
        {
            await _conn.DisposeAsync();
            _conn = null;
        }
    }

    public bool IsConnected => _conn?.State == HubConnectionState.Connected;

    public async ValueTask DisposeAsync()
    {
        if (_conn is not null)
            await _conn.DisposeAsync();
    }
}
