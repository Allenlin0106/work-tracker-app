namespace WorkTracker.Models;

public record JwtOptions(string Secret, int ExpiryDays);
