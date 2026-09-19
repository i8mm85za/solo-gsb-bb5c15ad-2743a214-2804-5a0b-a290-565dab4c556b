// 引擎冒烟测试：用 esbuild? 不引入依赖 —— 直接用 node 对 TS 源码做最小转译运行。
// Node 20 无法直接 require TS，这里通过子进程使用 client 里的 vite? 也不依赖。
// 做法：读取 engine.ts / types.ts，剥离类型注解后 eval —— 引擎本身只用简单语法。
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// 优先使用 TypeScript（npm install 后 node_modules 中有 tsc 产物）
const outDir = path.join(root, 'node_modules', '.engine-smoke');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const tscBin = path.join(root, 'node_modules', '.bin', 'tsc');
if (!fs.existsSync(tscBin)) {
  console.error('SKIP: 未找到 tsc，请先 npm install');
  process.exit(0);
}
const r = spawnSync(
  tscBin,
  [
    '--module', 'commonjs', '--target', 'ES2020', '--moduleResolution', 'node',
    '--esModuleInterop', '--skipLibCheck', '--outDir', outDir,
    path.join(root, 'shared/types.ts'),
    path.join(root, 'shared/engine.ts'),
    path.join(root, 'shared/doc.ts'),
    path.join(root, 'shared/samples.ts'),
  ],
  { stdio: 'inherit' },
);
if (r.status !== 0) process.exit(1);

const { simulate } = await import(path.join(outDir, 'engine.js'));
const { convergenceSample, oscillationSample } = await import(
  path.join(outDir, 'samples.js')
);
const { normalizeDocument } = await import(path.join(outDir, 'doc.js'));

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name} ${extra}`);
    failures++;
  }
}

console.log('收敛示例：');
const c1 = simulate(convergenceSample());
check('状态为 converged', c1.status === 'converged', c1.status);
check('迭代轮数 > 0', c1.iterations > 0, String(c1.iterations));
check('最终值在 [0,1]', Object.values(c1.final).every((v) => v >= 0 && v <= 1));
console.log(`    最终可信度: ${Object.entries(c1.final).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ')}`);

console.log('振荡示例（三观点互驳奇环）：');
const c2 = simulate(oscillationSample());
check('状态为 oscillating', c2.status === 'oscillating', c2.status);
check('至少报告 1 个环', c2.cycles.length >= 1, JSON.stringify(c2.cycles));
const ring = c2.cycles[0];
check('环含 3 个节点', ring?.nodes.length === 3, JSON.stringify(ring?.nodes));
check('环含 3 条边', ring?.edges.length === 3, JSON.stringify(ring?.edges));
check('至少迭代若干轮形成极限环', c2.iterations >= 3, String(c2.iterations));

console.log('证据固定：');
const pinnedDoc = {
  name: 'p',
  params: { gain: 0.8, bias: 0, retention: 0.5, tolerance: 1e-6, maxIterations: 500 },
  nodes: [
    { id: 'e', kind: 'evidence', label: 'e', initial: 0.42, pinned: true, x: 0, y: 0 },
  ],
  edges: [],
};
const c3 = simulate(pinnedDoc);
check('孤立证据恒为初始值', Math.abs(c3.final.e - 0.42) < 1e-9, String(c3.final.e));
check('无环', c3.cycles.length === 0);

console.log('空图 / 文档规整：');
let threw = false;
try {
  normalizeDocument({ nodes: [] });
} catch {
  threw = true;
}
check('空节点文档被拒绝', threw);

const norm = normalizeDocument({
  name: 'x',
  nodes: [
    { id: 'a', kind: 'claim', initial: 5 },
    { id: 'a', kind: 'claim' }, // 重复 id -> 重命名
    {},                          // 无 id -> 生成
  ],
  edges: [
    { source: 'a', target: 'a', stance: 'weird', weight: 9 },  // 自环合法，立场/权重被规整
    { source: 'a', target: 'missing' },                        // 悬空 -> 丢弃
    { source: 'a', target: 'a' },                              // 重复 -> 丢弃
  ],
});
const selfEdges = norm.edges.filter((e) => e.source === 'a' && e.target === 'a');
check('重复 id 被重命名', norm.nodes.length === 3 && norm.nodes[1].id !== 'a');
check('非法数值被裁剪/默认化', norm.nodes[0].initial === 1);
check('悬空/重复边丢弃，立场与权重规整', norm.edges.length === 1 &&
  selfEdges.length === 1 &&
  selfEdges[0].stance === 'support' && selfEdges[0].weight === 1);

console.log('max_iterations：');
const c4 = simulate({ ...oscillationSample(), params: {
  ...oscillationSample().params, maxIterations: 3, tolerance: 1e-12,
} });
check('小上限时正确终止（振荡或达到上限）',
  c4.status === 'max_iterations' || c4.status === 'oscillating');

fs.rmSync(outDir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} 项检查失败`);
  process.exit(1);
}
console.log('\n全部通过 ✅');
