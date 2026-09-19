/**
 * 论证可信度传播引擎
 *
 * 模型（同步迭代，允许有向环）：
 *   S_i = Σ_{j→i, support} w_ji · c_j
 *   R_i = Σ_{j→i, refute} w_ji · c_j
 *   raw_i = ρ·c_i + α·(S_i − (1+β)·R_i)
 *   c_i'  = clamp(raw_i, 0, 1)
 *
 * - ρ(retention) 自保留：越大越稳定
 * - α(gain) 影响增益：越大越容易振荡
 * - β(bias) 反驳基线偏向
 * - pinned 节点（默认即证据节点）恒定为初始可信度
 *
 * 终止条件：
 *   1. 收敛：max|c' − c| < tolerance
 *   2. 持续振荡：量化后的状态首次重复，且重复态中仍有活跃节点，
 *      随后在活跃子图上枚举导致振荡的初等环
 *   3. 达到最大迭代轮数
 */

import {
  GraphDocument,
  OscillatingCycle,
  SharedEdge,
  SharedNode,
  SimParams,
  SimResult,
} from './types';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const QUANTUM = 1e-5;

/** 运行一次完整的传播模拟（纯函数，无副作用） */
export function simulate(doc: GraphDocument): SimResult {
  const nodes: SharedNode[] = doc.nodes ?? [];
  const edges: SharedEdge[] = doc.edges ?? [];
  const p: SimParams = doc.params;

  const ids = nodes.map((n) => n.id);
  const pinned = new Set(
    nodes.filter((n) => n.pinned || n.kind === 'evidence').map((n) => n.id),
  );

  const incoming = new Map<string, SharedEdge[]>();
  for (const id of ids) incoming.set(id, []);
  for (const e of edges) {
    if (incoming.has(e.target) && incoming.has(e.source)) {
      incoming.get(e.target)!.push(e);
    }
  }

  let state: Record<string, number> = {};
  for (const n of nodes) state[n.id] = clamp01(n.initial);

  const history: Array<Record<string, number>> = [{ ...state }];
  const deltas: number[] = [];

  /** 量化键：容忍极小浮点误差的状态重复检测 */
  const keyOf = (s: Record<string, number>): string =>
    ids.map((id) => Math.round(s[id] / QUANTUM)).join('|');

  const seen = new Map<string, number>();
  seen.set(keyOf(state), 0);

  for (let iter = 1; iter <= p.maxIterations; iter++) {
    const next: Record<string, number> = {};
    let maxDelta = 0;

    for (const n of nodes) {
      if (pinned.has(n.id)) {
        next[n.id] = state[n.id];
        continue;
      }
      let support = 0;
      let refute = 0;
      for (const e of incoming.get(n.id) ?? []) {
        const w = Math.abs(e.weight);
        if (e.stance === 'support') support += w * state[e.source];
        else refute += w * state[e.source];
      }
      const raw =
        p.retention * state[n.id] +
        p.gain * (support - (1 + p.bias) * refute);
      next[n.id] = clamp01(raw);
      maxDelta = Math.max(maxDelta, Math.abs(next[n.id] - state[n.id]));
    }

    deltas.push(maxDelta);
    history.push({ ...next });
    state = next;

    // 1) 收敛
    if (maxDelta < p.tolerance) {
      return {
        status: 'converged',
        iterations: iter,
        final: state,
        history,
        deltas,
        cycles: [],
      };
    }

    // 2) 状态重复：周期轨道 → 持续振荡。
    //    防误判：比较重复周期内的相邻状态，确认该轨道确实在运动
    //    （重复当前态与历史态必然相等，不能拿它们比较）。
    const key = keyOf(state);
    const prev = seen.get(key);
    if (prev !== undefined && prev < iter) {
      // 周期窗口内任意时刻运动过的非固定节点，都是活跃子图的一部分
      // （单个节点可能在某一步恰好静止，不能只看某一次转移）。
      const active = ids.filter((id) => {
        if (pinned.has(id)) return false;
        for (let t = prev; t < iter; t++) {
          if (Math.abs(history[t + 1][id] - history[t][id]) > QUANTUM) return true;
        }
        return false;
      });
      if (active.length > 0) {
        const cycles = findCycles(ids, edges, new Set(active));
        return {
          status: 'oscillating',
          iterations: iter,
          final: state,
          history,
          deltas,
          cycles,
        };
      }
      // 状态重复但无活跃节点：等价于数值收敛，继续靠容差终止即可
    } else {
      seen.set(key, iter);
    }
  }

  // 3) 达到上限仍未收敛
  return {
    status: 'max_iterations',
    iterations: p.maxIterations,
    final: state,
    history,
    deltas,
    cycles: [],
  };
}

/**
 * 在“活跃子图”上枚举初等有向环（自环也算）。
 * 采用按起点裁剪的 DFS：以环上 id 最小的节点为根枚举，保证每个环只报一次。
 */
export function findCycles(
  ids: string[],
  edges: SharedEdge[],
  active: Set<string>,
): OscillatingCycle[] {
  const order = ids.filter((id) => active.has(id));
  const adj = new Map<string, SharedEdge[]>();
  for (const id of order) adj.set(id, []);
  for (const e of edges) {
    if (active.has(e.source) && active.has(e.target)) {
      adj.get(e.source)!.push(e);
    }
  }

  const cycles: OscillatingCycle[] = [];
  const MAX_CYCLES = 20;

  for (let r = 0; r < order.length && cycles.length < MAX_CYCLES; r++) {
    const root = order[r];
    // 只允许经过 id 序 >= root 的节点（根为环上最小 id）
    const allowed = new Set(order.slice(r));
    const nodeStack: string[] = [root];
    const edgeStack: string[] = [];
    const onStack = new Set<string>([root]);

    const dfs = (v: string): void => {
      if (cycles.length >= MAX_CYCLES) return;
      for (const e of adj.get(v) ?? []) {
        const t = e.target;
        if (!allowed.has(t)) continue;
        if (t === root) {
          cycles.push({ nodes: [...nodeStack], edges: [...edgeStack, e.id] });
          if (cycles.length >= MAX_CYCLES) return;
        } else if (!onStack.has(t)) {
          nodeStack.push(t);
          edgeStack.push(e.id);
          onStack.add(t);
          dfs(t);
          onStack.delete(t);
          edgeStack.pop();
          nodeStack.pop();
        }
      }
    };

    dfs(root);
  }

  return cycles;
}
