import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database;

/** 启动时自动建库建表（数据库文件不存在则创建） */
export function openDatabase(): Database.Database {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'sandbox.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS graphs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库尚未初始化');
  return db;
}
