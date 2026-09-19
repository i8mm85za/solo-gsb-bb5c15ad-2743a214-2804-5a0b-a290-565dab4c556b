import { GraphDocument, SimResult } from '@shared/types';

async function parse(res: Response) {
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  list(): Promise<{ id: number; name: string; updated_at: string }[]> {
    return fetch('/api/graphs').then(parse);
  },
  load(id: number): Promise<GraphDocument> {
    return fetch(`/api/graphs/${id}`).then(parse);
  },
  save(doc: GraphDocument): Promise<{ id: number }> {
    return fetch('/api/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    }).then(parse);
  },
  async simulate(doc: GraphDocument): Promise<SimResult | null> {
    try {
      return await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      }).then(parse);
    } catch {
      return null; // 离线/开发态下回退到本地引擎
    }
  },
  remove(id: number): Promise<null> {
    return fetch(`/api/graphs/${id}`, { method: 'DELETE' }).then(parse);
  },
};
