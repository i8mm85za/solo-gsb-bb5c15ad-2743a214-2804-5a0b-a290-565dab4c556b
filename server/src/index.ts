import express from 'express';
import path from 'path';
import fs from 'fs';
import { openDatabase } from './db';
import { apiRouter } from './routes';

const PORT = Number(process.env.PORT ?? 4000);

openDatabase();

const app = express();
app.use(express.json({ limit: '5mb' }));

app.use('/api', apiRouter);

// 生产环境：托管前端构建产物，并对非 /api 路由回退到 index.html（SPA）
// 编译后本文件位于 server/dist/server/src/index.js，前端在 client/dist
const clientDist =
  process.env.CLIENT_DIST || path.resolve(__dirname, '..', '..', '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[argument-stability-sandbox] listening on http://0.0.0.0:${PORT}`);
});
