/**
 * 论证稳定性沙盘 —— 前后端共享的数据类型
 */

export type NodeKind = 'claim' | 'evidence';

/** 证据节点固定（锚定）为初始可信度；观点节点参与传播 */
export interface SharedNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** 初始可信度 0..1，观点节点的迭代起点，证据节点的恒定值 */
  initial: number;
  /** 是否固定为初始可信度（证据默认 true） */
  pinned?: boolean;
  /** 画布坐标（React Flow 使用） */
  x?: number;
  y?: number;
}

/** 连线立场：支持 / 反驳 */
export type Stance = 'support' | 'refute';

export interface SharedEdge {
  id: string;
  source: string;
  target: string;
  stance: Stance;
  /** 影响权重 0..1 */
  weight: number;
}

/** 导入 / 导出 / 持久化的完整图文档 */
export interface GraphDocument {
  id?: number;
  name: string;
  nodes: SharedNode[];
  edges: SharedEdge[];
  params: SimParams;
  createdAt?: string;
  updatedAt?: string;
}

export interface SimParams {
  /** 影响增益 α */
  gain: number;
  /** 基线偏向 β：反驳输入相对于支持的强度（制造振荡的关键旋钮） */
  bias: number;
  /** 自保留 ρ：每轮保留自身旧值的比例 */
  retention: number;
  /** 收敛阈值：相邻两轮最大变化量小于该值即视为收敛 */
  tolerance: number;
  /** 最大迭代轮数 */
  maxIterations: number;
}

export const DEFAULT_PARAMS: SimParams = {
  gain: 0.8,
  bias: 0,
  retention: 0.5,
  tolerance: 0.001,
  maxIterations: 300,
};

export type SimStatus = 'converged' | 'oscillating' | 'max_iterations';

export interface OscillatingCycle {
  /** 构成环的节点 id（按方向顺序） */
  nodes: string[];
  /** 环上的边 id（按方向顺序） */
  edges: string[];
}

export interface SimResult {
  status: SimStatus;
  iterations: number;
  /** 节点 id -> 最终可信度 */
  final: Record<string, number>;
  /** 每轮的完整状态，用于前端回放动画（c0 为初始状态） */
  history: Array<Record<string, number>>;
  /** 每轮最大变化量 */
  deltas: number[];
  /** 振荡时：导致振荡的初等环（可能多个） */
  cycles: OscillatingCycle[];
}
