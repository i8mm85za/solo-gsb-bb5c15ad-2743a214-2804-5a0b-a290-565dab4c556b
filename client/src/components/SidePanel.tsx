import type { Edge, Node } from 'reactflow';
import type { ArgumentNodeData } from './ArgumentNode';
import type { GraphDocument, NodeKind, PropagateOptions, PropagateResult, Stance } from '../../../shared/graph';

export interface SelectionState {
  node?: Node<ArgumentNodeData>;
  edge?: Edge;
}

interface SidePanelProps {
  options: PropagateOptions;
  onOptionsChange: (options: PropagateOptions) => void;
  result: PropagateResult | null;
  selection: SelectionState;
  onUpdateNode: (id: string, patch: Partial<ArgumentNodeData>) => void;
  onUpdateEdge: (id: string, patch: { weight?: number; stance?: Stance }) => void;
  onDeleteSelection: () => void;
}

const optionLabels: Array<{ key: keyof PropagateOptions; label: string; min: number; max: number; step: number }> = [
  { key: 'threshold', label: '收敛阈值', min: 0.0001, max: 0.05, step: 0.0001 },
  { key: 'maxIterations', label: '最大迭代', min: 5, max: 500, step: 5 },
  { key: 'lambda', label: '传播强度 λ', min: 0, max: 1, step: 0.05 }
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SidePanel({
  options,
  onOptionsChange,
  result,
  selection,
  onUpdateNode,
  onUpdateEdge,
  onDeleteSelection
}: SidePanelProps) {
  return (
    <aside className="side-panel">
      <section className="panel-card">
        <h2>传播参数</h2>
        {optionLabels.map((item) => (
          <Field key={item.key} label={item.label}>
            <input
              type="number"
              min={item.min}
              max={item.max}
              step={item.step}
              value={options[item.key]}
              onChange={(event) =>
                onOptionsChange({ ...options, [item.key]: Number(event.target.value) })
              }
            />
          </Field>
        ))}
        <p className="hint">同步迭代：先验可信度 + λ·(支持 − 反驳)，结果裁剪到 0–1。</p>
      </section>

      <section className="panel-card">
        <h2>检查器</h2>
        {selection.node && (
          <div className="inspector">
            <Field label="标签">
              <input
                value={selection.node.data.label}
                onChange={(event) => onUpdateNode(selection.node!.id, { label: event.target.value })}
              />
            </Field>
            <Field label="类型">
              <select
                value={selection.node.data.kind}
                onChange={(event) =>
                  onUpdateNode(selection.node!.id, { kind: event.target.value as NodeKind })
                }
              >
                <option value="claim">观点 claim</option>
                <option value="evidence">证据 evidence</option>
              </select>
            </Field>
            <Field label={`初始可信度：${Math.round(selection.node.data.initialBelief * 100)}%`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={selection.node.data.initialBelief}
                onChange={(event) =>
                  onUpdateNode(selection.node!.id, { initialBelief: Number(event.target.value) })
                }
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={selection.node.data.anchored}
                onChange={(event) =>
                  onUpdateNode(selection.node!.id, { anchored: event.target.checked })
                }
              />
              固定为初始可信度
            </label>
            <button className="danger" onClick={onDeleteSelection}>
              删除节点
            </button>
          </div>
        )}

        {!selection.node && selection.edge && (
          <div className="inspector">
            <Field label="关系">
              <select
                value={(selection.edge.data?.stance as Stance) ?? 'support'}
                onChange={(event) =>
                  onUpdateEdge(selection.edge!.id, { stance: event.target.value as Stance })
                }
              >
                <option value="support">支持 support</option>
                <option value="rebut">反驳 rebut</option>
              </select>
            </Field>
            <Field label={`权重：${Math.round(Number(selection.edge.data?.weight ?? 0.6) * 100)}%`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={Number(selection.edge.data?.weight ?? 0.6)}
                onChange={(event) =>
                  onUpdateEdge(selection.edge!.id, { weight: Number(event.target.value) })
                }
              />
            </Field>
            <button className="danger" onClick={onDeleteSelection}>
              删除连线
            </button>
          </div>
        )}

        {!selection.node && !selection.edge && (
          <p className="hint">点击节点或连线进行编辑；从节点右侧圆点拖出即可连线。</p>
        )}
      </section>

      {result && (
        <section className={`panel-card result-card ${result.oscillating ? 'bad' : result.converged ? 'good' : 'warn'}`}>
          <h2>传播结果</h2>
          <p>{result.message}</p>
          <dl>
            <dt>迭代轮数</dt>
            <dd>{result.iterations}</dd>
            <dt>最终最大变化</dt>
            <dd>{result.maxChange.toFixed(5)}</dd>
            <dt>检测周期</dt>
            <dd>{result.detectedPeriod ?? '—'}</dd>
          </dl>
          {result.oscillating && (
            <div className="cycle-list">
              <strong>高亮的负反馈环（{result.cycles.length}）</strong>
              {result.cycles.length === 0 && <p className="hint">未枚举到满足强度阈值的奇数反驳环，但系统仍未稳定。</p>}
              {result.cycles.slice(0, 6).map((cycle, index) => (
                <div className="cycle-item" key={cycle.edgeIds.join('-')}>
                  <span>#{index + 1} 环：{cycle.nodeIds.join(' → ')} → {cycle.nodeIds[0]}</span>
                  <small>
                    {cycle.rebutCount} 条反驳 · |增益| {Math.abs(cycle.signedGain).toFixed(2)} · 活跃度{' '}
                    {cycle.activity.toFixed(3)}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

export function graphToDocument(name: string, nodes: Node<ArgumentNodeData>[], edges: Edge[]): GraphDocument {
  return {
    version: 1,
    name,
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.data.label,
      kind: node.data.kind,
      initialBelief: node.data.initialBelief,
      anchored: node.data.anchored,
      position: { x: node.position.x, y: node.position.y }
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      stance: (edge.data?.stance as Stance) ?? 'support',
      weight: Number(edge.data?.weight ?? 0.6)
    }))
  };
}
