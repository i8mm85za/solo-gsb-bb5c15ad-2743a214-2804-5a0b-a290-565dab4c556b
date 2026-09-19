import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  MiniMap,
  Node,
  NodeChange,
  ReactFlowProvider,
  MarkerType,
} from 'reactflow';
import {
  DEFAULT_PARAMS,
  GraphDocument,
  SharedEdge,
  SimParams,
  SimResult,
} from '@shared/types';
import { simulate } from '@shared/engine';
import { normalizeDocument, uid } from '@shared/doc';
import { convergenceSample, oscillationSample } from '@shared/samples';
import { api } from './api';
import FlowNode, { FlowNodeData } from './FlowNode';

const nodeTypes = { arg: FlowNode };

/** React Flow 的边 + 本应用挂载的立场/权重 */
type AppEdge = Edge & { stance?: SharedEdge['stance']; weight?: number };

type SavedMeta = { id: number; name: string; updated_at: string };

function docToState(doc: GraphDocument): {
  name: string;
  params: SimParams;
  nodes: Node<FlowNodeData>[];
  edges: AppEdge[];
} {
  return {
    name: doc.name,
    params: { ...doc.params },
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      type: 'arg',
      position: { x: n.x ?? 0, y: n.y ?? 0 },
      data: {
        label: n.label,
        kind: n.kind,
        initial: n.initial,
        pinned: n.pinned ?? n.kind === 'evidence',
        current: null,
        oscillating: false,
      },
    })),
    edges: doc.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

function AppInner() {
  const initial = useMemo(() => docToState(convergenceSample()), []);
  const [docName, setDocName] = useState(initial.name);
  const [params, setParams] = useState<SimParams>(initial.params);
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<AppEdge[]>(initial.edges);

  const [result, setResult] = useState<SimResult | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(220);

  const [saved, setSaved] = useState<SavedMeta[]>([]);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setFrame(0);
    setPlaying(false);
  }, []);

  // ---------- 回放动画 ----------
  useEffect(() => {
    if (!playing || !result) return;
    const last = result.history.length - 1;
    const t = window.setInterval(() => {
      setFrame((f) => {
        if (f >= last) {
          if (result.status === 'oscillating') return 0; // 循环回放振荡轨迹
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, speed);
    return () => window.clearInterval(t);
  }, [playing, result, speed]);

  const refreshSaved = useCallback(() => {
    api.list().then(setSaved).catch(() => setSaved([]));
  }, []);
  useEffect(refreshSaved, [refreshSaved]);

  // ---------- 画布编辑 ----------
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      if (changes.some((c) => c.type === 'remove')) clearResult();
    },
    [clearResult],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((es) => applyEdgeChanges(changes, es));
      if (changes.some((c) => c.type === 'remove')) clearResult();
    },
    [clearResult],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((es) =>
        decorateEdges(
          addEdge({ ...conn, id: uid('e') }, es) as AppEdge[],
        ),
      );
      clearResult();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearResult],
  );

  const addNode = (kind: 'claim' | 'evidence') => {
    const id = uid(kind === 'evidence' ? 'ev' : 'c');
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'arg',
        position: { x: 160 + Math.random() * 240, y: 120 + Math.random() * 200 },
        data: {
          label: kind === 'evidence' ? `证据 ${ns.length + 1}` : `观点 ${ns.length + 1}`,
          kind,
          initial: 0.5,
          pinned: kind === 'evidence',
          current: null,
          oscillating: false,
        },
      },
    ]);
    clearResult();
  };

  const updateNode = (id: string, patch: Partial<FlowNodeData>) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  };

  const edgeMeta = useCallback(
    (id: string): SharedEdge | undefined => {
      const e = edges.find((x) => x.id === id);
      if (!e) return undefined;
      // stance/weight 存在 edge 的附加字段上（导入/连线时写入）
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        stance: e.stance ?? 'support',
        weight: e.weight ?? 0.7,
      };
    },
    [edges],
  );

  const setEdgeProp = (id: string, patch: Partial<Pick<SharedEdge, 'stance' | 'weight'>>) => {
    setEdges((es) =>
      es.map((e) => {
        if (e.id !== id) return e;
        const stance = patch.stance ?? e.stance ?? 'support';
        const weight = patch.weight ?? e.weight ?? 0.7;
        return {
          ...e,
          ...patch,
          label: `${stance === 'support' ? '支持' : '反驳'} ${weight.toFixed(2)}`,
        };
      }),
    );
    clearResult();
  };

  // 连线/导入时把立场与权重挂到 edge 上
  const decorateEdges = (es: AppEdge[]): AppEdge[] =>
    es.map((e) => {
      const stance = e.stance ?? 'support';
      const weight = e.weight ?? 0.7;
      return { ...e, stance, weight, label: `${stance === 'support' ? '支持' : '反驳'} ${weight.toFixed(2)}` };
    });

  // ---------- 高亮集合 ----------
  const cycleEdges = useMemo(() => {
    const s = new Set<string>();
    result?.cycles.forEach((c) => c.edges.forEach((id) => s.add(id)));
    return s;
  }, [result]);
  const cycleNodes = useMemo(() => {
    const s = new Set<string>();
    result?.cycles.forEach((c) => c.nodes.forEach((id) => s.add(id)));
    return s;
  }, [result]);

  // ---------- 带动画帧的节点 / 带样式的边 ----------
  const displayNodes = useMemo<Node<FlowNodeData>[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          current: result ? (result.history[frame]?.[n.id] ?? null) : null,
          oscillating: cycleNodes.has(n.id),
        },
      })),
    [nodes, result, frame, cycleNodes],
  );

  const displayEdges = useMemo<AppEdge[]>(
    () =>
      edges.map((e) => {
        const stance = e.stance ?? 'support';
        const hot = cycleEdges.has(e.id);
        return {
          ...e,
          type: 'default',
          animated: hot,
          className: hot ? 'arg-edge--cycle' : `arg-edge--${stance}`,
          label: e.label ?? (stance === 'support' ? '支持' : '反驳'),
          labelStyle: {
            fill: hot ? '#fbbf24' : stance === 'support' ? '#6ee7b7' : '#fda4af',
            fontSize: 11,
            fontWeight: 600,
          },
          labelBgStyle: { fill: '#111827', fillOpacity: 0.8 },
          style: {
            stroke: hot ? '#fbbf24' : stance === 'support' ? '#34d399' : '#fb7185',
            strokeWidth: hot ? 3 : 2,
            strokeDasharray: stance === 'refute' ? '7 4' : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: hot ? '#fbbf24' : stance === 'support' ? '#34d399' : '#fb7185',
          },
        };
      }),
    [edges, cycleEdges],
  );

  // ---------- 构造文档 / 运行 ----------
  const buildDoc = useCallback((): GraphDocument => {
    return {
      name: docName,
      params,
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: n.data.kind,
        label: n.data.label,
        initial: n.data.initial,
        pinned: n.data.pinned,
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edges.map((e) => {
        const meta = edgeMeta(e.id)!;
        return meta;
      }),
    };
  }, [docName, params, nodes, edges, edgeMeta]);

  const runSimulation = () => {
    if (nodes.length === 0) {
      notify('画布为空，请先添加节点', 'err');
      return;
    }
    const r = simulate(buildDoc());
    setResult(r);
    setFrame(0);
    setPlaying(true);
    if (r.status === 'oscillating') {
      notify(`检测到持续振荡，高亮 ${r.cycles.length} 个环`, 'err');
    } else if (r.status === 'converged') {
      notify(`第 ${r.iterations} 轮收敛`);
    } else {
      notify('达到最大迭代轮数仍未收敛', 'err');
    }
  };

  // ---------- 导入 / 导出 ----------
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(buildDoc(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docName || 'argument-graph'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = normalizeDocument(JSON.parse(String(reader.result)));
        loadDocument(doc);
        notify(`已导入「${doc.name}」`);
      } catch (err) {
        notify(`导入失败：${(err as Error).message}`, 'err');
      }
    };
    reader.readAsText(file);
  };

  const loadDocument = (doc: GraphDocument) => {
    const s = docToState(normalizeDocument(doc));
    setDocName(s.name);
    setParams(s.params);
    setNodes(s.nodes);
    setEdges(decorateEdges(s.edges));
    clearResult();
  };

  // ---------- 持久化 ----------
  const saveGraph = async () => {
    try {
      const r = await api.save(buildDoc());
      notify(r.id ? `已保存（id=${r.id}）` : '已保存');
      refreshSaved();
    } catch (err) {
      notify(`保存失败：${(err as Error).message}`, 'err');
    }
  };

  const loadGraph = async (id: number) => {
    try {
      const doc = await api.load(id);
      loadDocument(doc);
      notify(`已载入「${doc.name}」`);
    } catch (err) {
      notify(`载入失败：${(err as Error).message}`, 'err');
    }
  };

  // ---------- 初始化边装饰 ----------
  useEffect(() => {
    setEdges((es) => decorateEdges(es));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 选中对象 ----------
  const selectedNode = nodes.find((n) => n.selected);
  const selectedEdge = edges.find((e) => e.selected);
  const selectedMeta = selectedEdge ? edgeMeta(selectedEdge.id) : undefined;

  const currentDelta = result && frame > 0 ? result.deltas[frame - 1] : null;

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__logo">🌀 论证稳定性沙盘</span>
        <input
          className="topbar__name"
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          placeholder="图名称"
        />
        <div className="topbar__spacer" />
        <button onClick={() => loadDocument(convergenceSample())}>收敛示例</button>
        <button onClick={() => loadDocument(oscillationSample())}>振荡示例</button>
        <button onClick={exportJson}>导出 JSON</button>
        <button onClick={() => fileInputRef.current?.click()}>导入 JSON</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
        <button className="primary" onClick={saveGraph}>
          保存到库
        </button>
        <select
          title="从 SQLite 读取已保存的图"
          value=""
          onChange={(e) => e.target.value && loadGraph(Number(e.target.value))}
        >
          <option value="">读取已存…</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} {s.name}
            </option>
          ))}
        </select>
      </header>

      <div className="body">
        <aside className="sidebar">
          <section>
            <h3>节点</h3>
            <div className="btn-row">
              <button onClick={() => addNode('claim')}>＋ 观点</button>
              <button onClick={() => addNode('evidence')}>＋ 证据</button>
            </div>
            <p className="hint">从节点右侧圆点拖到另一节点左侧圆点即可连线。证据默认 📌 固定。</p>
          </section>

          <section>
            <h3>传播参数</h3>
            <label className="param">
              <span>影响增益 α <b>{params.gain.toFixed(2)}</b></span>
              <input
                type="range" min={0} max={3} step={0.05}
                value={params.gain}
                onChange={(e) => {
                  setParams({ ...params, gain: Number(e.target.value) });
                  clearResult();
                }}
              />
            </label>
            <label className="param">
              <span>反驳偏向 β <b>{params.bias.toFixed(2)}</b></span>
              <input
                type="range" min={0} max={2} step={0.05}
                value={params.bias}
                onChange={(e) => {
                  setParams({ ...params, bias: Number(e.target.value) });
                  clearResult();
                }}
              />
            </label>
            <label className="param">
              <span>自保留 ρ <b>{params.retention.toFixed(2)}</b></span>
              <input
                type="range" min={0} max={0.95} step={0.05}
                value={params.retention}
                onChange={(e) => {
                  setParams({ ...params, retention: Number(e.target.value) });
                  clearResult();
                }}
              />
            </label>
            <label className="param">
              <span>收敛阈值 ε <b>{params.tolerance}</b></span>
              <input
                type="range" min={0.0001} max={0.02} step={0.0001}
                value={params.tolerance}
                onChange={(e) => {
                  setParams({ ...params, tolerance: Number(e.target.value) });
                  clearResult();
                }}
              />
            </label>
            <label className="param">
              <span>最大轮数 <b>{params.maxIterations}</b></span>
              <input
                type="range" min={20} max={2000} step={20}
                value={params.maxIterations}
                onChange={(e) => {
                  setParams({ ...params, maxIterations: Number(e.target.value) });
                  clearResult();
                }}
              />
            </label>
            <button
              className="link"
              onClick={() => {
                setParams({ ...DEFAULT_PARAMS });
                clearResult();
              }}
            >
              恢复默认参数
            </button>
            <p className="hint">
              更新式：c′ = clamp(ρ·c + α·(Σ支持·w − (1+β)·Σ反驳·w))。α 越大、ρ 越小越容易振荡。
            </p>
          </section>

          <section>
            <h3>模拟</h3>
            <div className="btn-row">
              <button className="primary" onClick={runSimulation}>▶ 运行传播</button>
              <button
                onClick={() => {
                  setPlaying((p) => !p);
                }}
                disabled={!result}
              >
                {playing ? '⏸ 暂停' : '⏵ 播放'}
              </button>
              <button
                disabled={!result || frame >= (result?.history.length ?? 1) - 1}
                onClick={() => {
                  setPlaying(false);
                  setFrame((f) => f + 1);
                }}
              >
                单步
              </button>
              <button disabled={!result} onClick={() => {
                setFrame(0);
                setPlaying(false);
              }}>
                ⏮ 重置
              </button>
            </div>
            <label className="param">
              <span>回放速度</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={400}>慢</option>
                <option value={220}>正常</option>
                <option value={90}>快</option>
              </select>
            </label>
          </section>
        </aside>

        <main className="canvas">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            minZoom={0.2}
          >
            <Background gap={20} color="#1f2937" />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                (n as Node<FlowNodeData>).data?.kind === 'evidence' ? '#0ea5e9' : '#6366f1'
              }
              maskColor="rgba(15,23,42,0.7)"
            />
          </ReactFlow>

          {toast && <div className={`toast toast--${toast.kind}`}>{toast.text}</div>}
        </main>

        <aside className="inspector">
          <h3>属性检查器</h3>
          {selectedNode && (
            <div className="insp">
              <label className="field">
                <span>名称</span>
                <input
                  value={selectedNode.data.label}
                  onChange={(e) => {
                    updateNode(selectedNode.id, { label: e.target.value });
                    clearResult();
                  }}
                />
              </label>
              <label className="field">
                <span>类型</span>
                <select
                  value={selectedNode.data.kind}
                  onChange={(e) => {
                    const kind = e.target.value as 'claim' | 'evidence';
                    updateNode(selectedNode.id, {
                      kind,
                      pinned: kind === 'evidence',
                    });
                    clearResult();
                  }}
                >
                  <option value="claim">观点 claim</option>
                  <option value="evidence">证据 evidence</option>
                </select>
              </label>
              <label className="field">
                <span>初始可信度：{selectedNode.data.initial.toFixed(2)}</span>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={selectedNode.data.initial}
                  onChange={(e) => {
                    updateNode(selectedNode.id, { initial: Number(e.target.value) });
                    clearResult();
                  }}
                />
              </label>
              <label className="field check">
                <input
                  type="checkbox"
                  checked={selectedNode.data.pinned}
                  onChange={(e) => {
                    updateNode(selectedNode.id, { pinned: e.target.checked });
                    clearResult();
                  }}
                />
                <span>📌 固定（恒为初始值，不参与传播）</span>
              </label>
              {result && (
                <div className="field readonly">
                  最终可信度：<b>{(result.final[selectedNode.id] ?? 0).toFixed(4)}</b>
                </div>
              )}
              <button
                className="danger"
                onClick={() => {
                  const id = selectedNode.id;
                  setNodes((ns) => ns.filter((n) => n.id !== id));
                  setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
                  clearResult();
                }}
              >
                删除节点
              </button>
            </div>
          )}

          {selectedEdge && selectedMeta && (
            <div className="insp">
              <label className="field">
                <span>立场</span>
                <select
                  value={selectedMeta.stance}
                  onChange={(e) =>
                    setEdgeProp(selectedEdge.id, {
                      stance: e.target.value as SharedEdge['stance'],
                    })
                  }
                >
                  <option value="support">支持（绿实线）</option>
                  <option value="refute">反驳（红虚线）</option>
                </select>
              </label>
              <label className="field">
                <span>权重：{selectedMeta.weight.toFixed(2)}</span>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={selectedMeta.weight}
                  onChange={(e) =>
                    setEdgeProp(selectedEdge.id, { weight: Number(e.target.value) })
                  }
                />
              </label>
              <div className="field readonly">
                {selectedMeta.source} → {selectedMeta.target}
              </div>
              <button
                className="danger"
                onClick={() => setEdges((es) => es.filter((x) => x.id !== selectedEdge.id))}
              >
                删除连线
              </button>
            </div>
          )}

          {!selectedNode && !selectedEdge && (
            <p className="hint">点击节点或连线以编辑其属性；选中后按 Delete 删除。</p>
          )}

          {result && (
            <section className="result">
              <h3>运行结果</h3>
              <div className={`status status--${result.status}`}>
                {result.status === 'converged'
                  ? '✅ 已收敛'
                  : result.status === 'oscillating'
                    ? '⚠️ 持续振荡'
                    : '⛔ 达到最大轮数'}
              </div>
              <ul className="kv">
                <li><span>迭代轮数</span><b>{result.iterations}</b></li>
                <li><span>当前帧</span><b>{frame}/{result.history.length - 1}</b></li>
                <li><span>帧间最大变化</span><b>{currentDelta === null ? '—' : currentDelta.toExponential(2)}</b></li>
                <li><span>振荡环数</span><b>{result.cycles.length}</b></li>
              </ul>
              {result.cycles.length > 0 && (
                <div className="cycles">
                  <p>高亮的振荡环：</p>
                  {result.cycles.map((c, i) => (
                    <div key={i} className="cycle-chip">
                      {[...c.nodes, c.nodes[0]].join(' → ')}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      <footer className="statusbar">
        <span>节点 {nodes.length}</span>
        <span>连线 {edges.length}</span>
        <span className="statusbar__spacer" />
        <span>
          {result
            ? `状态：${result.status === 'converged' ? '收敛' : result.status === 'oscillating' ? '振荡' : '未收敛'} · 轮次 ${result.iterations}`
            : '尚未运行'}
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}
