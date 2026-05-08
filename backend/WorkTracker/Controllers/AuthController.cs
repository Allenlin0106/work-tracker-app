using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using WorkTracker.Models;
using WorkTracker.Services;

namespace WorkTracker.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(DbService db, JwtOptions jwtOpts) : ControllerBase
{
    // GET /api/auth/status — 有無帳號（決定是否顯示 setup 畫面）
    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        try
        {
            await using var conn = await db.OpenAsync();
            var count = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM users");
            return Ok(new { needsSetup = count == 0 });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    // POST /api/auth/setup — 建立第一個帳號
    [HttpPost("setup")]
    public async Task<IActionResult> Setup([FromBody] AuthRequest req)
    {
        try
        {
            await using var conn = await db.OpenAsync();
            var count = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM users");
            if (count > 0)
                return StatusCode(403, new { error = "設定已完成，請直接登入" });

            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { error = "帳號與密碼為必填" });

            if (req.Password.Length < 8 || !req.Password.Any(char.IsDigit))
                return BadRequest(new { error = "密碼需至少 8 個字元且包含數字" });

            var hash = BCrypt.Net.BCrypt.HashPassword(req.Password, workFactor: 12);
            var row = (await conn.QueryAsync<UserRow>(
                "INSERT INTO users (username, password_hash) " +
                "OUTPUT INSERTED.id, INSERTED.username, INSERTED.password_hash " +
                "VALUES (@Username, @Hash)",
                new { Username = req.Username, Hash = hash })).Single();

            return Ok(new { token = MakeJwt(row.id, row.username), username = row.username });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    // POST /api/auth/login — 驗證密碼，回傳 JWT（rate limited: 10/min）
    [HttpPost("login")]
    [EnableRateLimiting("loginPolicy")]
    public async Task<IActionResult> Login([FromBody] AuthRequest req)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { error = "帳號與密碼為必填" });

            await using var conn = await db.OpenAsync();
            var user = await conn.QueryFirstOrDefaultAsync<UserRow>(
                "SELECT id, username, password_hash FROM users WHERE username = @Username",
                new { Username = req.Username });

            if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.password_hash))
                return Unauthorized(new { error = "帳號或密碼錯誤" });

            return Ok(new { token = MakeJwt(user.id, user.username), username = user.username });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return StatusCode(500, new { error = "內部伺服器錯誤" });
        }
    }

    private string MakeJwt(Guid userId, string username)
    {
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOpts.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            claims: [
                new Claim("userId",   userId.ToString().ToLower()),
                new Claim("username", username),
            ],
            expires:           DateTime.UtcNow.AddDays(jwtOpts.ExpiryDays),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    // Internal row class matching users table column names (Dapper maps by name)
    private class UserRow
    {
        public Guid   id            { get; set; }
        public string username      { get; set; } = "";
        public string password_hash { get; set; } = "";
    }
}

public record AuthRequest(string Username, string Password);
