import { Handle, Position, type NodeProps } from 'reactflow';
import type { NodeKind } from '../../../shared/graph';

export interface ArgumentNodeData {
  label: string;
  kind: NodeKind;
  initialBelief: number;
  anchored: boolean;
  finalBelief?: number;
  inCycle?: boolean;
  [key: string]: unknown;
}

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export function ArgumentNode({ data, selected }: NodeProps<ArgumentNodeData>) {
  const final = typeof data.finalBelief === 'number';
  const delta = final ? data.finalBelief! - data.initialBelief : 0;
  const deltaText = final ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%` : '';

  return (
    <div
      className={[
        'argument-node',
        `kind-${data.kind}`,
        selected ? 'selected' : '',
        data.inCycle ? 'in-cycle' : '',
        data.anchored ? 'anchored' : ''
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-heading">
        <span className="node-kind">{data.kind === 'evidence' ? '证据' : '观点'}</span>
        {data.anchored && <span className="anchor-badge" title="传播中固定为先验可信度">固定</span>}
      </div>
      <div className="node-label">{data.label}</div>
      <div className="belief-row">
        <span>初始 {formatPercent(data.initialBelief)}</span>
        {final && <strong>{formatPercent(data.finalBelief!)}</strong>}
      </div>
      {final && <div className={`belief-delta ${delta >= 0 ? 'up' : 'down'}`}>{deltaText}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = { argument: ArgumentNode };
