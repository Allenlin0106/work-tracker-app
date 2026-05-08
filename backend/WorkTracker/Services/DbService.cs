using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;

namespace WorkTracker.Services;

public class DbService(string connectionString)
{
    // ── Row classes ───────────────────────────────────────────────────────────

    public class TaskRow
    {
        public Guid     id                  { get; set; }
        public string   title               { get; set; } = "";
        public string?  group_name          { get; set; }
        public string?  assignee            { get; set; }
        public DateTime? start_date         { get; set; }
        public DateTime? end_date           { get; set; }
        public int      progress            { get; set; }
        public bool     is_recurring        { get; set; }
        public string?  recurrence_type     { get; set; }
        public int      recurrence_interval { get; set; }
        public string?  tags                { get; set; }
        public string?  attachments         { get; set; }
        public string?  checklist           { get; set; }
        public DateTime created_at          { get; set; }
        public DateTime updated_at          { get; set; }
    }

    public class LogRow
    {
        public Guid     id         { get; set; }
        public Guid     task_id    { get; set; }
        public string?  text       { get; set; }
        public string?  user_name  { get; set; }
        public DateTime? timestamp { get; set; }
        public DateTime created_at { get; set; }
        public DateTime updated_at { get; set; }
    }

    public class GroupRow
    {
        public Guid     id         { get; set; }
        public string   name       { get; set; } = "";
        public string?  color      { get; set; }
        public DateTime created_at { get; set; }
        public DateTime updated_at { get; set; }
    }

    // ── Row mappers ───────────────────────────────────────────────────────────

    public static object FromTaskRow(TaskRow r) => new
    {
        id                 = r.id.ToString().ToLower(),
        title              = r.title,
        group              = r.group_name,
        assignee           = ParseJson(r.assignee, "[]"),
        startDate          = r.start_date?.ToString("yyyy-MM-dd"),
        endDate            = r.end_date?.ToString("yyyy-MM-dd"),
        progress           = r.progress,
        isRecurring        = r.is_recurring,
        recurrenceType     = r.recurrence_type,
        recurrenceInterval = r.recurrence_interval,
        tags               = ParseJson(r.tags, "[]"),
        attachments        = ParseJson(r.attachments, "[]"),
        checklist          = ParseJson(r.checklist, "[]"),
        createdAt          = r.created_at,
        updatedAt          = r.updated_at,
    };

    public static object FromLogRow(LogRow r) => new
    {
        id        = r.id.ToString().ToLower(),
        taskId    = r.task_id.ToString().ToLower(),
        text      = r.text,
        userName  = r.user_name,
        timestamp = r.timestamp,
        createdAt = r.created_at,
        updatedAt = r.updated_at,
    };

    public static object FromGroupRow(GroupRow r) => new
    {
        id        = r.id.ToString().ToLower(),
        name      = r.name,
        color     = r.color,
        createdAt = r.created_at,
        updatedAt = r.updated_at,
    };

    // ParseJson: deserialise stored JSON string back to JsonElement for response serialisation.
    // Returns a cloned element so lifetime is independent of any JsonDocument.
    private static JsonElement ParseJson(string? s, string defaultJson)
    {
        var json = string.IsNullOrEmpty(s) ? defaultJson : s;
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    // ── Connection ────────────────────────────────────────────────────────────

    public async Task<SqlConnection> OpenAsync()
    {
        var conn = new SqlConnection(connectionString);
        await conn.OpenAsync();
        return conn;
    }

    // ── Read all ─────────────────────────────────────────────────────────────

    public async Task<IList<object>> GetAllAsync(string col)
    {
        await using var conn = await OpenAsync();
        return col switch
        {
            "tasks"  => (await conn.QueryAsync<TaskRow>("SELECT * FROM tasks ORDER BY created_at"))
                            .Select(r => FromTaskRow(r)).Cast<object>().ToList(),
            "logs"   => (await conn.QueryAsync<LogRow>("SELECT * FROM logs ORDER BY created_at"))
                            .Select(r => FromLogRow(r)).Cast<object>().ToList(),
            "groups" => (await conn.QueryAsync<GroupRow>("SELECT * FROM [groups] ORDER BY created_at"))
                            .Select(r => FromGroupRow(r)).Cast<object>().ToList(),
            "tags"   => (await conn.QueryAsync<GroupRow>("SELECT * FROM tags ORDER BY created_at"))
                            .Select(r => FromGroupRow(r)).Cast<object>().ToList(),
            _        => throw new ArgumentException($"Unknown collection: {col}"),
        };
    }

    // ── DB init ───────────────────────────────────────────────────────────────

    public async Task InitAsync()
    {
        await using var conn = await OpenAsync();
        Console.WriteLine("[DB] SQL Server connected");

        await conn.ExecuteAsync("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'users' AND xtype='U')
            CREATE TABLE users (
              id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
              username      NVARCHAR(255)    NOT NULL UNIQUE,
              password_hash NVARCHAR(255)    NOT NULL,
              created_at    DATETIME2        NOT NULL DEFAULT GETDATE(),
              updated_at    DATETIME2        NOT NULL DEFAULT GETDATE()
            )
            """);

        await conn.ExecuteAsync("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'groups' AND xtype='U')
            CREATE TABLE [groups] (
              id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
              name       NVARCHAR(255)    NOT NULL UNIQUE,
              color      NVARCHAR(50),
              created_at DATETIME2        NOT NULL DEFAULT GETDATE(),
              updated_at DATETIME2        NOT NULL DEFAULT GETDATE()
            )
            """);

        await conn.ExecuteAsync("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'tags' AND xtype='U')
            CREATE TABLE tags (
              id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
              name       NVARCHAR(255)    NOT NULL UNIQUE,
              color      NVARCHAR(50),
              created_at DATETIME2        NOT NULL DEFAULT GETDATE(),
              updated_at DATETIME2        NOT NULL DEFAULT GETDATE()
            )
            """);

        await conn.ExecuteAsync("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'tasks' AND xtype='U')
            CREATE TABLE tasks (
              id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
              title               NVARCHAR(500)    NOT NULL,
              group_name          NVARCHAR(255),
              assignee            NVARCHAR(MAX),
              start_date          DATE,
              end_date            DATE,
              progress            INT              NOT NULL DEFAULT 0,
              is_recurring        BIT              NOT NULL DEFAULT 0,
              recurrence_type     NVARCHAR(50),
              recurrence_interval INT              NOT NULL DEFAULT 1,
              tags                NVARCHAR(MAX),
              attachments         NVARCHAR(MAX),
              checklist           NVARCHAR(MAX),
              created_at          DATETIME2        NOT NULL DEFAULT GETDATE(),
              updated_at          DATETIME2        NOT NULL DEFAULT GETDATE()
            )
            """);

        await conn.ExecuteAsync("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=N'logs' AND xtype='U')
            CREATE TABLE logs (
              id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
              task_id    UNIQUEIDENTIFIER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              text       NVARCHAR(MAX),
              user_name  NVARCHAR(255),
              timestamp  DATETIME2,
              created_at DATETIME2        NOT NULL DEFAULT GETDATE(),
              updated_at DATETIME2        NOT NULL DEFAULT GETDATE()
            )
            """);

        Console.WriteLine("[DB] Tables ready");
    }
}
