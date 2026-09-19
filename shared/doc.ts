import { DEFAULT_PARAMS, GraphDocument, SharedEdge, SharedNode, SimParams } from './types';

let counter = 0;
export function uid(prefix = 'n'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 校验并规整导入的 JSON。容错策略：
 * - 丢弃指向缺失节点的边、自重复边
 * - 缺失字段补默认值；数值裁剪到合法区间
 * - 无节点时抛错
 */
export function normalizeDocument(raw: unknown): GraphDocument {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('JSON 根节点必须是对象');
  }
  const obj = raw as Partial<GraphDocument>;
  if (!Array.isArray(obj.nodes)) throw new Error('缺少 nodes 数组');

  const usedIds = new Set<string>();
  const nodes: SharedNode[] = [];
  obj.nodes.forEach((n, i) => {
    if (typeof n !== 'object' || n === null) return;
    const nn = n as Partial<SharedNode>;
    let id = typeof nn.id === 'string' && nn.id ? nn.id : uid('n');
    while (usedIds.has(id)) id = uid('n');
    usedIds.add(id);
    const kind = nn.kind === 'evidence' ? 'evidence' : 'claim';
    nodes.push({
      id,
      kind,
      label:
        typeof nn.label === 'string' && nn.label
          ? nn.label
          : `${kind === 'evidence' ? '证据' : '观点'} ${i + 1}`,
      initial: isNum(nn.initial) ? clamp01(nn.initial) : 0.5,
      pinned:
        typeof nn.pinned === 'boolean' ? nn.pinned : kind === 'evidence',
      x: isNum(nn.x) ? nn.x : 80 + i * 40,
      y: isNum(nn.y) ? nn.y : 80 + ((i * 90) % 360),
    });
  });

  if (nodes.length === 0) throw new Error('图中至少需要一个节点');

  const edgeKeys = new Set<string>();
  const edges: SharedEdge[] = [];
  if (Array.isArray(obj.edges)) {
    for (const e of obj.edges) {
      if (typeof e !== 'object' || e === null) continue;
      const ee = e as Partial<SharedEdge>;
      if (typeof ee.source !== 'string' || typeof ee.target !== 'string') continue;
      if (!usedIds.has(ee.source) || !usedIds.has(ee.target)) continue;
      const key = `${ee.source}->${ee.target}`;
      if (edgeKeys.has(key)) continue; // 同方向平行边保留第一条
      edgeKeys.add(key);
      edges.push({
        id: typeof ee.id === 'string' && ee.id ? ee.id : uid('e'),
        source: ee.source,
        target: ee.target,
        stance: ee.stance === 'refute' ? 'refute' : 'support',
        weight: isNum(ee.weight) ? clamp01(ee.weight) : 0.7,
      });
    }
  }

  const rp = (obj.params ?? {}) as Partial<SimParams>;
  const params: SimParams = {
    gain: isNum(rp.gain) ? Math.max(0, rp.gain) : DEFAULT_PARAMS.gain,
    bias: isNum(rp.bias) ? Math.max(0, rp.bias) : DEFAULT_PARAMS.bias,
    retention: isNum(rp.retention) ? clamp01(rp.retention) : DEFAULT_PARAMS.retention,
    tolerance: isNum(rp.tolerance) && rp.tolerance > 0 ? rp.tolerance : DEFAULT_PARAMS.tolerance,
    maxIterations:
      isNum(rp.maxIterations) && rp.maxIterations > 0
        ? Math.min(10000, Math.floor(rp.maxIterations))
        : DEFAULT_PARAMS.maxIterations,
  };

  return {
    name: typeof obj.name === 'string' && obj.name ? obj.name : '导入的图',
    nodes,
    edges,
    params,
  };
}
