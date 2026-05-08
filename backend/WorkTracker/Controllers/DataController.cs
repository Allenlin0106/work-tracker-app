using System.Data;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using WorkTracker.Hubs;
using WorkTracker.Services;

namespace WorkTracker.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class DataController(DbService db, IHubContext<TrackerHub> hub) : ControllerBase
{
    // ── Field maps（對應 Node.js TASK_FIELD_MAP / LOG_FIELD_MAP / GROUP_FIELD_MAP）────

    private record FieldDef(string Key, string Col, DbType DbType, Func<JsonElement, object?> Convert);

    private static readonly FieldDef[] TaskFieldMap =
    [
        new("title",              "title",               DbType.String,   v => v.ValueKind == JsonValueKind.Null ? null : v.GetString()),
        new("group",              "group_name",          DbType.String,   v => v.ValueKind == JsonValueKind.Null ? null : v.GetString()),
        new("assignee",           "assignee",            DbType.String,   v => AssigneeToJson(v)),
        new("startDate",          "start_date",          DbType.Date,     v => ParseDate(v)),
        new("endDate",            "end_date",            DbType.Date,     v => ParseDate(v)),
        new("progress",           "progress",            DbType.Int32,    v => v.TryGetInt32(out var i) ? (object?)i : 0),
        new("isRecurring",        "is_recurring",        DbType.Boolean,  v => v.ValueKind == JsonValueKind.True),
        new("recurrenceType",     "recurrence_type",     DbType.String,   v => v.ValueKind == JsonValueKind.Null ? null : v.GetString()),
        new("recurrenceInterval", "recurrence_interval", DbType.Int32,    v => v.TryGetInt32(out var i) ? (object?)i : 1),
        new("tags",               "tags",                DbType.String,   v => v.ValueKind == JsonValueKind.Null ? "[]" : v.GetRawText()),
        new("attachments",        "attachments",         DbType.String,   v => v.ValueKind == JsonValueKind.Null ? "[]" : v.GetRawText()),
        new("checklist",          "checklist",           DbType.String,   v => v.ValueKind == JsonValueKind.Null ? "[]" : v.GetRawText()),
    ];

    private static readonly FieldDef[] LogFieldMap =
    [
        new("text",      "text",      DbType.String,    v => v.ValueKind == JsonValueKind.Null ? null : v.GetString()),
        new("userName",  "user_name", DbType.String,    v => v.ValueKind == JsonValueKind.Null ? null : v.GetString()),
        new("timestamp", "timestamp", DbType.DateTime2, v => ParseDateTime(v)),
    ];

    // tags と groups は同じフィールド構造
    private static readonly FieldDef[] GroupTagFieldMap =
    [
        new("name",  "name",  DbType.String, v => v.GetString()),
        new("color", "color", DbType.String, v => v.ValueKind == JsonValueKind.Null ? null : v.GetString()),
    ];

    private static readonly Dictionary<string, FieldDef[]> FieldMaps = new()
    {
        ["tasks"]  = TaskFieldMap,
        ["logs"]   = LogFieldMap,
        ["groups"] = GroupTagFieldMap,
        ["tags"]   = GroupTagFieldMap,
    };

    private static readonly Dictionary<string, string> TableNames = new()
    {
        ["tasks"]  = "tasks",
        ["logs"]   = "logs",
        ["groups"] = "[groups]",
        ["tags"]   = "tags",
    };

    // ── CRUD ─────────────────────────────────────────────────────────────────

    [HttpGet("{col}")]
    public async Task<IActionResult> List(string col)
    {
        if (!TableNames.ContainsKey(col)) return NotFound();
        try
        {
            return Ok(await db.GetAllAsync(col));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    [HttpPost("{col}")]
    public async Task<IActionResult> Insert(string col, [FromBody] JsonElement body)
    {
        if (!TableNames.ContainsKey(col)) return NotFound();
        try
        {
            await using var conn = await db.OpenAsync();
            var doc = col switch
            {
                "tasks"  => await InsertTaskAsync(body, conn),
                "logs"   => await InsertLogAsync(body, conn),
                "groups" => await InsertGroupAsync(body, conn),
                "tags"   => await InsertTagAsync(body, conn),
                _        => throw new ArgumentException(col),
            };
            var all = await db.GetAllAsync(col);
            await hub.Clients.All.SendAsync($"{col}:updated", all);
            return Ok(doc);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    [HttpPatch("{col}/{id}")]
    public async Task<IActionResult> Update(string col, string id, [FromBody] JsonElement body)
    {
        if (!TableNames.ContainsKey(col)) return NotFound();
        if (!Guid.TryParse(id, out _)) return BadRequest(new { error = "Invalid id" });
        try
        {
            await using var conn = await db.OpenAsync();
            await BuildUpdateAsync(TableNames[col], id, body, FieldMaps[col], conn);
            var all = await db.GetAllAsync(col);
            await hub.Clients.All.SendAsync($"{col}:updated", all);
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    [HttpDelete("{col}/{id}")]
    public async Task<IActionResult> Delete(string col, string id)
    {
        if (!TableNames.ContainsKey(col)) return NotFound();
        if (!Guid.TryParse(id, out var guid)) return BadRequest(new { error = "Invalid id" });
        try
        {
            await using var conn = await db.OpenAsync();
            await conn.ExecuteAsync(
                $"DELETE FROM {TableNames[col]} WHERE id = @Id",
                new { Id = guid });
            var all = await db.GetAllAsync(col);
            await hub.Clients.All.SendAsync($"{col}:updated", all);
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    // ── INSERT helpers ────────────────────────────────────────────────────────

    private static async Task<object> InsertTaskAsync(JsonElement b, System.Data.IDbConnection conn)
    {
        var rows = await conn.QueryAsync<DbService.TaskRow>("""
            INSERT INTO tasks
              (title, group_name, assignee, start_date, end_date, progress, is_recurring,
               recurrence_type, recurrence_interval, tags, attachments, checklist)
            OUTPUT INSERTED.*
            VALUES
              (@title, @group_name, @assignee, @start_date, @end_date, @progress, @is_recurring,
               @recurrence_type, @recurrence_interval, @tags, @attachments, @checklist)
            """,
            new
            {
                title               = GetStr(b, "title"),
                group_name          = GetStrOrNull(b, "group"),
                assignee            = GetAssigneeJson(b),
                start_date          = GetDateOrNull(b, "startDate"),
                end_date            = GetDateOrNull(b, "endDate"),
                progress            = GetInt(b, "progress"),
                is_recurring        = GetBool(b, "isRecurring"),
                recurrence_type     = GetStrOrNull(b, "recurrenceType"),
                recurrence_interval = GetInt(b, "recurrenceInterval", 1),
                tags                = GetJsonArray(b, "tags"),
                attachments         = GetJsonArray(b, "attachments"),
                checklist           = GetJsonArray(b, "checklist"),
            });
        return DbService.FromTaskRow(rows.Single());
    }

    private static async Task<object> InsertLogAsync(JsonElement b, System.Data.IDbConnection conn)
    {
        var rows = await conn.QueryAsync<DbService.LogRow>("""
            INSERT INTO logs (task_id, text, user_name, timestamp)
            OUTPUT INSERTED.*
            VALUES (@task_id, @text, @user_name, @timestamp)
            """,
            new
            {
                task_id   = Guid.Parse(GetStr(b, "taskId")),
                text      = GetStrOrNull(b, "text"),
                user_name = GetStrOrNull(b, "userName"),
                timestamp = GetDateTimeOrNow(b, "timestamp"),
            });
        return DbService.FromLogRow(rows.Single());
    }

    private static async Task<object> InsertGroupAsync(JsonElement b, System.Data.IDbConnection conn)
    {
        var rows = await conn.QueryAsync<DbService.GroupRow>("""
            INSERT INTO [groups] (name, color)
            OUTPUT INSERTED.*
            VALUES (@name, @color)
            """,
            new { name = GetStr(b, "name"), color = GetStrOrNull(b, "color") });
        return DbService.FromGroupRow(rows.Single());
    }

    private static async Task<object> InsertTagAsync(JsonElement b, System.Data.IDbConnection conn)
    {
        var rows = await conn.QueryAsync<DbService.GroupRow>("""
            INSERT INTO tags (name, color)
            OUTPUT INSERTED.*
            VALUES (@name, @color)
            """,
            new { name = GetStr(b, "name"), color = GetStrOrNull(b, "color") });
        return DbService.FromGroupRow(rows.Single());
    }

    // ── Dynamic PATCH builder（対応 Node.js buildUpdate）──────────────────────

    private static async Task BuildUpdateAsync(
        string table, string id, JsonElement body, FieldDef[] fieldMap,
        System.Data.IDbConnection conn)
    {
        var dp = new DynamicParameters();
        var setParts = new List<string>();
        dp.Add("id", Guid.Parse(id), DbType.Guid);

        foreach (var def in fieldMap)
        {
            // Skip $-prefixed keys (mirrors Node.js sanitizeBody)
            if (def.Key.StartsWith('$')) continue;
            if (!body.TryGetProperty(def.Key, out var val)) continue;

            dp.Add(def.Col, def.Convert(val), def.DbType);
            setParts.Add($"{def.Col} = @{def.Col}");
        }

        if (setParts.Count == 0) return;
        setParts.Add("updated_at = GETDATE()");
        await conn.ExecuteAsync(
            $"UPDATE {table} SET {string.Join(", ", setParts)} WHERE id = @id", dp);
    }

    // ── Body extraction helpers ───────────────────────────────────────────────

    private static string GetStr(JsonElement b, string key, string def = "") =>
        b.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? def : def;

    private static string? GetStrOrNull(JsonElement b, string key) =>
        b.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private static int GetInt(JsonElement b, string key, int def = 0) =>
        b.TryGetProperty(key, out var v) && v.TryGetInt32(out var i) ? i : def;

    private static bool GetBool(JsonElement b, string key, bool def = false) =>
        b.TryGetProperty(key, out var v) ? v.ValueKind == JsonValueKind.True : def;

    private static DateTime? GetDateOrNull(JsonElement b, string key)
    {
        if (!b.TryGetProperty(key, out var v)) return null;
        var s = v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return string.IsNullOrEmpty(s) ? null : DateTime.Parse(s);
    }

    private static DateTime GetDateTimeOrNow(JsonElement b, string key)
    {
        if (!b.TryGetProperty(key, out var v)) return DateTime.UtcNow;
        var s = v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return string.IsNullOrEmpty(s) ? DateTime.UtcNow : DateTime.Parse(s);
    }

    private static string GetJsonArray(JsonElement b, string key)
    {
        if (!b.TryGetProperty(key, out var v)) return "[]";
        return v.ValueKind == JsonValueKind.Array ? v.GetRawText() : "[]";
    }

    // assignee 可為 string 或 array（mirrors Node.js val: v => JSON.stringify(Array.isArray(v)?v:v?[v]:[])）
    private static string GetAssigneeJson(JsonElement b)
    {
        if (!b.TryGetProperty("assignee", out var v)) return "[]";
        return v.ValueKind switch
        {
            JsonValueKind.Array  => v.GetRawText(),
            JsonValueKind.String => JsonSerializer.Serialize(new[] { v.GetString() }),
            _                    => "[]",
        };
    }

    // ── Value converters for PATCH field map ──────────────────────────────────

    private static string AssigneeToJson(JsonElement v) =>
        v.ValueKind switch
        {
            JsonValueKind.Array  => v.GetRawText(),
            JsonValueKind.String => JsonSerializer.Serialize(new[] { v.GetString() }),
            _                    => "[]",
        };

    private static DateTime? ParseDate(JsonElement v)
    {
        if (v.ValueKind == JsonValueKind.Null) return null;
        var s = v.GetString();
        return string.IsNullOrEmpty(s) ? null : DateTime.Parse(s);
    }

    private static DateTime? ParseDateTime(JsonElement v)
    {
        if (v.ValueKind == JsonValueKind.Null) return null;
        var s = v.GetString();
        return string.IsNullOrEmpty(s) ? null : DateTime.Parse(s);
    }
}
