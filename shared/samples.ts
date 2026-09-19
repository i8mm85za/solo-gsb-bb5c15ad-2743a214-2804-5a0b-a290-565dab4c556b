import { DEFAULT_PARAMS, GraphDocument } from './types';

/** 示例 1：证据 → 观点 → 结论，正常收敛 */
export function convergenceSample(): GraphDocument {
  return {
    name: '示例：收敛论证',
    params: { ...DEFAULT_PARAMS },
    nodes: [
      { id: 'e1', kind: 'evidence', label: '实验数据 A', initial: 0.9, pinned: true, x: 60, y: 60 },
      { id: 'e2', kind: 'evidence', label: '文献综述 B', initial: 0.7, pinned: true, x: 60, y: 220 },
      { id: 'c1', kind: 'claim', label: '假设 H 成立', initial: 0.5, x: 340, y: 120 },
      { id: 'e3', kind: 'evidence', label: '反例报告', initial: 0.8, pinned: true, x: 60, y: 380 },
      { id: 'c2', kind: 'claim', label: '最终结论', initial: 0.5, x: 640, y: 180 },
    ],
    edges: [
      { id: 'x1', source: 'e1', target: 'c1', stance: 'support', weight: 0.9 },
      { id: 'x2', source: 'e2', target: 'c1', stance: 'support', weight: 0.6 },
      { id: 'x3', source: 'e3', target: 'c1', stance: 'refute', weight: 0.7 },
      { id: 'x4', source: 'c1', target: 'c2', stance: 'support', weight: 0.8 },
      { id: 'x5', source: 'e3', target: 'c2', stance: 'refute', weight: 0.5 },
    ],
  };
}

/**
 * 示例 2：三个观点各自由一份恒定证据提供基础支持，同时互相反驳构成奇环。
 * 反驳环增益 α·r = 1.5 > 1，钳制更新落入周期 6 的极限环，
 * 用于演示持续振荡检测与环高亮（高亮的是观点之间的反驳环）。
 */
export function oscillationSample(): GraphDocument {
  return {
    name: '示例：三方互相反驳（振荡）',
    params: { ...DEFAULT_PARAMS, gain: 1.5, retention: 0, bias: 0, tolerance: 1e-4 },
    nodes: [
      { id: 'base', kind: 'evidence', label: '恒定基础佐证', initial: 1, pinned: true, x: 380, y: 190 },
      { id: 'a', kind: 'claim', label: '观点 A', initial: 0.9, x: 380, y: 40 },
      { id: 'b', kind: 'claim', label: '观点 B', initial: 0.1, x: 120, y: 320 },
      { id: 'c', kind: 'claim', label: '观点 C', initial: 0.1, x: 640, y: 320 },
    ],
    edges: [
      { id: 'ba', source: 'base', target: 'a', stance: 'support', weight: 0.5 },
      { id: 'bb', source: 'base', target: 'b', stance: 'support', weight: 0.5 },
      { id: 'bc', source: 'base', target: 'c', stance: 'support', weight: 0.5 },
      { id: 'ab', source: 'a', target: 'b', stance: 'refute', weight: 1 },
      { id: 'bx', source: 'b', target: 'c', stance: 'refute', weight: 1 },
      { id: 'ca', source: 'c', target: 'a', stance: 'refute', weight: 1 },
    ],
  };
}
