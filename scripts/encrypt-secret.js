/**
 * 密碼加密工具
 * 用法：node scripts/encrypt-secret.js
 *
 * 互動式輸入明文密碼，輸出 AES-256-CBC 加密後的 base64 密文，
 * 將密文填入 .env 的 ENCRYPTED_SQL_PASSWORD 或 ENCRYPTED_JWT_SECRET。
 */

const crypto = require('crypto');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', 'secrets', 'encryption_key.txt');

// 若金鑰檔不存在，自動產生 32-byte 隨機金鑰並儲存
if (!fs.existsSync(KEY_FILE)) {
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, key, { mode: 0o400 });
  console.log(`[✓] 已產生加密金鑰：${KEY_FILE}`);
  console.log('    請妥善保管此金鑰，遺失後加密資料將無法還原。\n');
}

const keyHex = fs.readFileSync(KEY_FILE, 'utf8').trim();

const encrypt = (text, hexKey) => {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.question('請輸入要加密的密碼（輸入後按 Enter）：', (secret) => {
  if (!secret.trim()) {
    console.error('[ERROR] 密碼不可為空');
    process.exit(1);
  }
  const cipher = encrypt(secret.trim(), keyHex);
  console.log('\n加密結果（填入 .env）：');
  console.log(cipher);
  rl.close();
});
