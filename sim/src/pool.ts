// 並列実行：worker_threads で1局ずつ回す。同じバンドル（dist/main.cjs）をワーカーとしても使う
import { Worker } from 'node:worker_threads';
import type { AgentConfig } from './ai';
import type { GameResult } from './play';

export interface Job {
  cond: string;
  char?: string;
  seed: number;
  cfg: AgentConfig;
  aiSeed: number;
  /** 等価性の検査用：false なら structuredClone のまま（高速な複製を使わない） */
  fast?: boolean;
}

export class Pool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { job: Job; resolve: (r: GameResult) => void; reject: (e: unknown) => void }[] = [];
  private busy = new Map<Worker, { resolve: (r: GameResult) => void; reject: (e: unknown) => void }>();

  constructor(size: number, file: string, fast = true) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(file, { workerData: { worker: true, fast } });
      w.on('message', (r: GameResult | { error: string }) => {
        const h = this.busy.get(w)!;
        this.busy.delete(w);
        if ('error' in r) h.reject(new Error(r.error));
        else h.resolve(r);
        this.idle.push(w);
        this.pump();
      });
      w.on('error', (e) => {
        const h = this.busy.get(w);
        if (h) h.reject(e);
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(job: Job): Promise<GameResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const q = this.queue.shift()!;
      this.busy.set(w, { resolve: q.resolve, reject: q.reject });
      w.postMessage(q.job);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
