import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { failure } from './config.mjs';

export const databasePath = fileURLToPath(new URL('../.runtime/studio.sqlite', import.meta.url));
export function problem(message, status = 400) { return Object.assign(failure(message), { status }); }

// All snapshots and their evidence are committed together; an active pointer never overwrites a version.
export class HistoryStore {
  constructor(filename = databasePath) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, task TEXT NOT NULL, current_version INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS versions (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, snapshot TEXT NOT NULL, reason TEXT NOT NULL,
        created_at TEXT NOT NULL, exported_at TEXT, PRIMARY KEY(session_id, version)
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        type TEXT NOT NULL, data BLOB NOT NULL
      );
      PRAGMA user_version=1;`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  create(task, snapshot, assets = [], id = randomUUID()) {
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO sessions VALUES(?,?,1,1,?,?)').run(id, JSON.stringify(task), now, now);
      this.db.prepare('INSERT INTO versions VALUES(?,1,?,?,?,NULL)').run(id, JSON.stringify({ ...snapshot, task }), '首次生成', now);
      const insert = this.db.prepare('INSERT INTO assets VALUES(?,?,?,?)');
      for (const asset of assets) insert.run(asset.id, id, asset.type, asset.buffer);
      return this.get(id);
    });
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
    if (!row) throw problem('这条历史不存在，可能已被删除。', 404);
    const value = this.db.prepare('SELECT * FROM versions WHERE session_id=? AND version=?').get(id, row.current_version);
    const snapshot = JSON.parse(value.snapshot);
    return { id, task: snapshot.task || JSON.parse(row.task), version: row.current_version, revision: row.revision,
      createdAt: row.created_at, updatedAt: row.updated_at, exportedAt: value.exported_at,
      snapshot, versions: this.db.prepare('SELECT version,reason,created_at AS createdAt,exported_at AS exportedAt FROM versions WHERE session_id=? ORDER BY version DESC').all(id) };
  }
  assertCurrent(id, revision) {
    const session = this.get(id);
    if (!Number.isSafeInteger(revision) || session.revision !== revision) throw problem('该会话已有新版本或已回退。请重新打开历史后再编辑，当前输入尚未覆盖存档。', 409);
    return session;
  }
  append(id, revision, snapshot, reason, task) {
    return this.transaction(() => {
      const previous = this.assertCurrent(id, revision);
      const version = this.db.prepare('SELECT MAX(version)+1 AS n FROM versions WHERE session_id=?').get(id).n;
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO versions VALUES(?,?,?,?,?,NULL)').run(id, version, JSON.stringify({ ...snapshot, task: task || previous.task }), reason, now);
      this.db.prepare('UPDATE sessions SET current_version=?,revision=revision+1,updated_at=?,task=COALESCE(?,task) WHERE id=?').run(version, now, task ? JSON.stringify(task) : null, id);
      return this.get(id);
    });
  }
  checkout(id, revision, version) {
    return this.transaction(() => {
      this.assertCurrent(id, revision);
      if (!Number.isSafeInteger(version) || !this.db.prepare('SELECT 1 FROM versions WHERE session_id=? AND version=?').get(id, version)) throw problem('版本不存在。');
      this.db.prepare('UPDATE sessions SET current_version=?,revision=revision+1,updated_at=? WHERE id=?').run(version, new Date().toISOString(), id);
      return this.get(id);
    });
  }
  markExport(id, revision) {
    return this.transaction(() => {
      const session = this.assertCurrent(id, revision), now = new Date().toISOString();
      this.db.prepare('UPDATE versions SET exported_at=? WHERE session_id=? AND version=?').run(now, id, session.version);
      return now;
    });
  }
  list() {
    return this.db.prepare(`SELECT s.id,s.task,s.current_version AS version,s.updated_at AS updatedAt,
      v.snapshot,v.exported_at AS exportedAt,(SELECT COUNT(*) FROM versions WHERE session_id=s.id) AS versionCount
      FROM sessions s JOIN versions v ON s.id=v.session_id AND s.current_version=v.version ORDER BY s.updated_at DESC,s.id`).all().map(row => {
      const snapshot = JSON.parse(row.snapshot), task = snapshot.task || JSON.parse(row.task), { draft } = snapshot;
      return { id: row.id, title: draft.title, product: draft.product?.name || task.productId, scene: task.scene,
        platform: task.platform, updatedAt: row.updatedAt, version: row.version, versionCount: row.versionCount,
        status: draft.verification?.status || 'error', exportedAt: row.exportedAt };
    });
  }
  asset(id) {
    const asset = this.db.prepare('SELECT type,data FROM assets WHERE id=?').get(id);
    if (!asset) throw problem('存档图片不存在。', 404);
    return asset;
  }
  delete(id) {
    if (!this.db.prepare('DELETE FROM sessions WHERE id=?').run(id).changes) throw problem('历史不存在。', 404);
  }
  clear() { this.transaction(() => this.db.exec('DELETE FROM sessions')); }
  close() { this.db.close(); }
}

export function present(session) {
  return { ...session.snapshot.draft, sessionId: session.id, task: session.task,
    version: session.version, revision: session.revision, versions: session.versions,
    locks: session.snapshot.locks || [], points: session.snapshot.points || [],
    exportedAt: session.exportedAt, updatedAt: session.updatedAt };
}
