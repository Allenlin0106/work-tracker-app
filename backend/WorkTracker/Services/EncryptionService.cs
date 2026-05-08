using System.Security.Cryptography;
using System.Text;

namespace WorkTracker.Services;

public class EncryptionService
{
    private readonly string? _keyHex;

    public EncryptionService()
    {
        _keyHex =
            ReadFile("/run/secrets/encryption_key") ??
            ReadFile(Path.Combine(AppContext.BaseDirectory,
                "..", "..", "..", "..", "..", "secrets", "encryption_key.txt"));
    }

    // Returns the decrypted value when `encrypted` is set, otherwise returns `plaintext`.
    // Throws if encrypted is set but no key file is found.
    public string ResolveSecret(string? encrypted, string? plaintext)
    {
        if (!string.IsNullOrWhiteSpace(encrypted))
        {
            if (_keyHex == null)
                throw new InvalidOperationException(
                    "[ERROR] 找不到加密金鑰，請確認 secrets/encryption_key.txt 存在");
            return Decrypt(encrypted);
        }
        return plaintext
            ?? throw new InvalidOperationException("No secret configured (EncryptedXxx or Xxx must be set)");
    }

    // Mirrors Node.js decrypt(): base64(IV[16] || AES-256-CBC(plaintext))
    private string Decrypt(string base64Cipher)
    {
        var data      = Convert.FromBase64String(base64Cipher);
        var iv        = data[..16];
        var encrypted = data[16..];
        using var aes = Aes.Create();
        aes.Mode    = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.Key     = Convert.FromHexString(_keyHex!);
        aes.IV      = iv;
        using var dec = aes.CreateDecryptor();
        return Encoding.UTF8.GetString(dec.TransformFinalBlock(encrypted, 0, encrypted.Length));
    }

    private static string? ReadFile(string path)
    {
        try { return File.ReadAllText(path).Trim(); }
        catch { return null; }
    }
}
