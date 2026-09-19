import { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { NodeKind } from '@shared/types';

export interface FlowNodeData {
  label: string;
  kind: NodeKind;
  initial: number;
  pinned: boolean;
  /** 当前（回放帧上的）可信度 0..1；null 表示未运行 */
  current: number | null;
  oscillating: boolean;
}

function credibilityColor(v: number): string {
  // 红(0) → 琥珀(0.5) → 翠绿(1)
  if (v < 0.5) {
    const t = v / 0.5;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (v - 0.5) / 0.5;
  const r = Math.round(245 + (16 - 245) * t);
  const g = Math.round(158 + (185 - 158) * t);
  const b = Math.round(11 + (129 - 11) * t);
  return `rgb(${r},${g},${b})`;
}

function FlowNode({ data, selected }: NodeProps<FlowNodeData>) {
  const shown = data.current ?? data.initial;
  const pct = Math.round(shown * 100);
  const ringClass = [
    'arg-node',
    `arg-node--${data.kind}`,
    selected ? 'arg-node--selected' : '',
    data.oscillating ? 'arg-node--oscillating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={ringClass}>
      <Handle type="target" position={Position.Left} className="arg-handle" />
      <div className="arg-node__head">
        <span className="arg-node__kind">{data.kind === 'evidence' ? '证据' : '观点'}</span>
        {data.pinned && <span className="arg-node__pin" title="固定：不参与传播，恒为初始可信度">📌</span>}
        <span className="arg-node__pct">{pct}%</span>
      </div>
      <div className="arg-node__label" title={data.label}>
        {data.label}
      </div>
      <div className="arg-node__bar">
        <div
          className="arg-node__bar-fill"
          style={{ width: `${pct}%`, background: credibilityColor(shown) }}
        />
      </div>
      <Handle type="source" position={Position.Right} className="arg-handle" />
    </div>
  );
}

export default memo(FlowNode);
