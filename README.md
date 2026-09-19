# 论证稳定性沙盘（Argument Stability Sandbox）

在有向循环图上对“观点—证据”网络进行可信度迭代传播的 Web 沙盘：

- 🟦 **证据节点**（默认 📌 固定为初始可信度）与 🟪 **观点节点**
- 拖拽连线，标记 **支持（绿实线）** 或 **反驳（红虚线）** 并设置 **权重**
- 按各节点 **初始可信度** 在允许环的有向图上 **同步迭代传播**
- 相邻两轮最大变化量 **低于收敛阈值** → 停止并显示每个节点的最终可信度
- **持续振荡**（量化状态重复，出现周期轨道）→ 自动停止，并以金色高亮 **导致振荡的初等环**（节点脉冲 + 边线流光）
- 当前图可一键 **导出 / 导入 JSON**；图可保存到服务器端 SQLite
- 画布上逐步回放整条迭代轨迹（播放 / 暂停 / 单步 / 重置）

## 唯一启动命令

```bash
docker compose up --build
```

构建时会安装全部依赖并编译前后端；容器启动时自动创建 SQLite 数据库与表（无需任何手动初始化）。

启动后访问：

- **应用地址：** http://localhost:4000
- **端口：** `4000`（前后端同源；API 前缀 `/api`）

停止：`docker compose down`（数据保留在命名卷 `sandbox-data` 中，加 `-v` 一并删除数据）。

## 必要配置

均为可选项，默认值开箱即用，在 `docker-compose.yml` 的 `environment` 中修改：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4000` | 容器内监听端口；改宿主机端口改 compose 的 `ports` 左侧，如 `"8080:4000"` |
| `DB_PATH` | `/app/data/sandbox.db` | SQLite 数据库文件路径，所在目录挂载为卷 `sandbox-data` |

## JSON 导入 / 导出格式

```json
{
  "name": "示例：收敛论证",
  "params": { "gain": 0.8, "bias": 0, "retention": 0.5, "tolerance": 0.001, "maxIterations": 300 },
  "nodes": [
    { "id": "e1", "kind": "evidence", "label": "实验数据 A", "initial": 0.9, "pinned": true,  "x": 60, "y": 60 },
    { "id": "c1", "kind": "claim",    "label": "假设 H 成立", "initial": 0.5, "pinned": false, "x": 340, "y": 120 }
  ],
  "edges": [
    { "id": "x1", "source": "e1", "target": "c1", "stance": "support", "weight": 0.9 },
    { "id": "x2", "source": "e1", "target": "c1", "stance": "refute",  "weight": 0.7 }
  ]
}
```

- `kind`: `claim`（观点）| `evidence`（证据，默认固定）
- `stance`: `support` | `refute`；`initial` / `weight` 均为 `0..1`
- 导入时会自动校验：丢弃悬空/重复边、裁剪越界数值、补全缺失字段与 id

## 传播模型

每个非固定节点在第 t+1 轮（全部节点同步更新）：

```
S_i = Σ_{j→i, support} w_ji · c_j(t)
R_i = Σ_{j→i, refute}  w_ji · c_j(t)
c_i(t+1) = clamp( ρ·c_i(t) + α·( S_i − (1+β)·R_i ) , 0, 1 )
```

- **α（影响增益）** 越大、**ρ（自保留）** 越小，系统越容易越过稳定边界进入振荡；**β（反驳偏向）** 放大反驳输入
- 固定节点（证据或手动 📌）恒为初始可信度，作为网络的输入源
- **收敛判定：** `max_i |c_i(t+1) − c_i(t)| < 收敛阈值 ε`
- **振荡判定：** 将状态量化（1e-5 级）后出现重复且重复态中仍有活跃节点，即认定为周期轨道；随后只在活跃子图上枚举初等有向环（按最小 id 定根的 DFS，含自环），最多报告 20 个环
- 超过 **最大轮数** 仍不满足以上条件，状态标记为“未收敛”

> 顶栏内置两个一键示例：**收敛示例** 展示证据→观点→结论的正常传播；
> **振荡示例** 是三个观点互相反驳的奇环（NOT³），饱和线性更新落入周期 6 的极限环，用于演示自动停止与环高亮。

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/graphs` | 图列表 |
| GET | `/api/graphs/:id` | 读取完整图（JSON 文档） |
| POST | `/api/graphs` | 保存新图，body 为上述 JSON 文档 |
| PUT | `/api/graphs/:id` | 更新图 |
| DELETE | `/api/graphs/:id` | 删除图 |
| POST | `/api/simulate` | 提交图文档，直接返回传播结果（状态/迭代数/最终值/历史/振荡环） |

## 本地开发（非 Docker）

```bash
npm install
npm run build         # 编译 server + client
npm start             # 启动 API 并托管 client/dist，http://localhost:4000

# 或前端热更新开发：
npm run dev:server    # 终端 1：:4000
npm run dev:client    # 终端 2：:5173（/api 代理到 4000）

npm run test:engine   # 引擎数值冒烟测试（收敛 / 振荡 / 环检测 / 导入规整）
```

## 技术栈

React 18 + TypeScript + Vite + React Flow 11 · Node.js 20 + Express · better-sqlite3 · 前后端共用同一份传播引擎（`shared/engine.ts`） · 多阶段 Docker 构建。
