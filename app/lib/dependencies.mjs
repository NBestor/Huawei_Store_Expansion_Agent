import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { failure } from './config.mjs';

// Prefer project dependencies; the desktop distribution already bundles these packages.
export function dependency(name) {
  const locations = [import.meta.url, path.join(path.dirname(process.execPath), '../package.json'),
    path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')];
  for (const location of locations) {
    try { return createRequire(location)(name); } catch {}
  }
  throw failure('PDF组件未安装，请在项目根目录执行 npm install 后重试。');
}
