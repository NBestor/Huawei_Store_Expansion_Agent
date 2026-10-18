import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
try {
  const values = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
} catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取本地 .env 配置，请检查格式。'); }

// Only display known diagnostic text; never return provider bodies or signed media URLs.
export function safeError(error) { return error?.publicMessage || '服务调用失败，请检查网络、凭证或重试。'; }
export function failure(message) { const error = new Error(message); error.publicMessage = message; return error; }
