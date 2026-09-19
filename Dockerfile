# ---------- 构建阶段：安装依赖并编译前后端 ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 通常有 node:20 预编译二进制；装构建工具链以便在取不到预编译包时回退源码编译
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# 利用 Docker 层缓存：先拷包清单
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install

# 拷贝源码并构建（server -> dist/，client -> dist/）
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN npm run build

# ---------- 运行阶段：仅保留生产依赖与构建产物 ----------
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# 生产依赖（better-sqlite3 有 node:20 的预编译二进制，无需编译工具链）
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# SQLite 数据库存放目录（启动时自动建库建表）
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/sandbox.db
ENV PORT=4000

EXPOSE 4000
VOLUME ["/app/data"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/graphs').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/server/src/index.js"]
