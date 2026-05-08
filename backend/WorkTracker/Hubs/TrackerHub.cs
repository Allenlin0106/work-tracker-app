using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using WorkTracker.Services;

namespace WorkTracker.Hubs;

[Authorize]
public class TrackerHub(DbService db) : Hub
{
    // On connect: push all 4 collections to the new client (mirrors Node.js io.on('connection'))
    public override async Task OnConnectedAsync()
    {
        var username = Context.User?.FindFirst("username")?.Value ?? "unknown";
        Console.WriteLine($"[WS] Client connected: {Context.ConnectionId} ({username})");

        foreach (var col in new[] { "tasks", "logs", "groups", "tags" })
        {
            var data = await db.GetAllAsync(col);
            await Clients.Caller.SendAsync($"{col}:updated", data);
        }

        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        Console.WriteLine($"[WS] Client disconnected: {Context.ConnectionId}");
        return base.OnDisconnectedAsync(exception);
    }
}
