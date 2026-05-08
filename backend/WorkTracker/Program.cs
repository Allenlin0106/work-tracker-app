using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;
using WorkTracker.Hubs;
using WorkTracker.Models;
using WorkTracker.Services;

var builder = WebApplication.CreateBuilder(args);
var appCfg  = builder.Configuration.GetSection("App");

// ── 1. 啟動時解密敏感憑證（對應 Node.js 啟動時的 decrypt / ResolveSecret）─────

var enc         = new EncryptionService();
var sqlPassword = enc.ResolveSecret(appCfg["EncryptedSqlPassword"], appCfg["SqlPassword"]);
var jwtSecret   = enc.ResolveSecret(appCfg["EncryptedJwtSecret"],   appCfg["JwtSecret"] ?? "dev-secret-change-in-production");

// ── 2. SQL Server 連線字串 ─────────────────────────────────────────────────────

var connStr = new SqlConnectionStringBuilder
{
    DataSource             = $"{appCfg["SqlServer"] ?? "localhost"},{appCfg["SqlPort"] ?? "1433"}",
    InitialCatalog         = appCfg["SqlDatabase"] ?? "worktracker",
    UserID                 = appCfg["SqlUser"] ?? "",
    Password               = sqlPassword,
    Encrypt                = bool.Parse(appCfg["SqlEncrypt"]  ?? "false"),
    TrustServerCertificate = bool.Parse(appCfg["SqlTrustCert"] ?? "true"),
    MaxPoolSize            = 10,
    ConnectTimeout         = 30,
}.ConnectionString;

// ── 3. 服務注入 ────────────────────────────────────────────────────────────────

builder.Services.AddSingleton(new DbService(connStr));
builder.Services.AddSingleton(new JwtOptions(jwtSecret, int.Parse(appCfg["JwtExpiryDays"] ?? "30")));
builder.Services.AddSignalR();
builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

// ── 4. CORS（AllowCredentials 為 SignalR 握手所必需）──────────────────────────

var corsOrigin = appCfg["CorsOrigin"] ?? "http://localhost:5173";
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(corsOrigin)
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

// ── 5. JWT 驗證 ────────────────────────────────────────────────────────────────

var keyBytes = Encoding.UTF8.GetBytes(jwtSecret);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(keyBytes),
            ValidateIssuer           = false,
            ValidateAudience         = false,
            ClockSkew                = TimeSpan.Zero,
        };
        // SignalR 以 QueryString access_token 傳遞 JWT（WebSocket 協議不支援 Authorization header）
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

// ── 6. 速率限制（登入：10 次 / 分鐘 / IP，對應 express-rate-limit）─────────

builder.Services.AddRateLimiter(o =>
{
    o.AddPolicy<string, ClientIpPolicy>("loginPolicy");
    o.OnRejected = async (ctx, _) =>
    {
        ctx.HttpContext.Response.StatusCode = 429;
        await ctx.HttpContext.Response.WriteAsJsonAsync(
            new { error = "嘗試次數過多，請稍後再試" });
    };
});

var app = builder.Build();

// ── 7. 資料庫初始化（等 DB 連線成功再開 HTTP，對應 Node.js initDb()）─────────

await app.Services.GetRequiredService<DbService>().InitAsync();

// ── 8. 中介層管線 ──────────────────────────────────────────────────────────────

app.UseRateLimiter();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<TrackerHub>("/hubs/tracker");

await app.RunAsync();

// ── Per-IP fixed-window rate limiter policy ────────────────────────────────────

public class ClientIpPolicy : IRateLimiterPolicy<string>
{
    public RateLimitPartition<string> GetPartition(HttpContext httpContext) =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit      = 10,
                Window           = TimeSpan.FromMinutes(1),
                QueueLimit       = 0,
                AutoReplenishment = true,
            });

    public Func<OnRejectedContext, CancellationToken, ValueTask>? OnRejected => null;
}
