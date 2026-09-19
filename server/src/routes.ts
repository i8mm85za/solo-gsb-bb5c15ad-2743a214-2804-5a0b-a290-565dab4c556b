import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from './db';
import { simulate } from '../../shared/engine';
import { normalizeDocument } from '../../shared/doc';
import { GraphDocument } from '../../shared/types';

export const apiRouter = Router();

apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();
  try {
    req.body = normalizeDocument(req.body);
    next();
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** GET /api/graphs —— 图列表（不含内容） */
apiRouter.get('/graphs', (req: Request, res: Response) => {
  const rows = getDb()
    .prepare(`SELECT id, name, created_at, updated_at FROM graphs ORDER BY updated_at DESC`)
    .all();
  res.json(rows);
});

/** GET /api/graphs/:id —— 读取完整图 */
apiRouter.get('/graphs/:id', (req: Request, res: Response) => {
  const row = getDb().prepare(`SELECT * FROM graphs WHERE id = ?`).get(req.params.id);
  if (!row) {
    res.status(404).json({ error: '图不存在' });
    return;
  }
  const payload = JSON.parse((row as { payload: string }).payload) as GraphDocument;
  res.json({
    ...payload,
    id: (row as { id: number }).id,
    name: (row as { name: string }).name,
    createdAt: (row as { created_at: string }).created_at,
    updatedAt: (row as { updated_at: string }).updated_at,
  });
});

/** POST /api/graphs —— 新建图 */
apiRouter.post('/graphs', (req: Request, res: Response) => {
  const doc = req.body as GraphDocument;
  const info = getDb()
    .prepare(`INSERT INTO graphs (name, payload) VALUES (?, ?)`)
    .run(doc.name, JSON.stringify(doc));
  res.status(201).json({ id: info.lastInsertRowid, name: doc.name });
});

/** PUT /api/graphs/:id —— 更新图 */
apiRouter.put('/graphs/:id', (req: Request, res: Response) => {
  const doc = req.body as GraphDocument;
  const info = getDb()
    .prepare(`UPDATE graphs SET name = ?, payload = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(doc.name, JSON.stringify(doc), req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: '图不存在' });
    return;
  }
  res.json({ id: Number(req.params.id), name: doc.name });
});

/** DELETE /api/graphs/:id —— 删除图 */
apiRouter.delete('/graphs/:id', (req: Request, res: Response) => {
  const info = getDb().prepare(`DELETE FROM graphs WHERE id = ?`).run(req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: '图不存在' });
    return;
  }
  res.status(204).end();
});

/** POST /api/simulate —— 服务端运行一次传播（便于校验/无前端调用） */
apiRouter.post('/simulate', (req: Request, res: Response) => {
  const doc = req.body as GraphDocument;
  res.json(simulate(doc));
});
