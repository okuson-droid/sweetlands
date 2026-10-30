// オンライン対戦の共有状態（decisions §4.4、§11）。
// 1つのページにつき1ゲーム。共有データベースの1件のドキュメント games/current に、
// 設定・初期シード・席・手の列を置く。盤面は各画面が手の列を再生して作る（ゲーム処理は決定的）。
import type { GameConfig } from '../game/types';

export interface GameDoc {
  status: 'lobby' | 'playing';
  config: GameConfig;
  seed: number;
  /** 席ごとの利用者 ID（user capability の id()）。空席は null */
  seats: (string | null)[];
  /** ゲームを作った人。やり直し（新しいゲーム）を出せる */
  creator: string;
  moves: string[];
  /** 書き込むたびに1増やす（食い違いの検出用） */
  version: number;
  /** 席ごとの思考時間（ミリ秒）。手を送った人が、自分の画面で測った分を足して書く（docs/decisions_13 §13.19）。以前のドキュメントにはない */
  think?: number[];
}

export interface Room {
  /** この閲覧者の利用者 ID。null なら書き込めない（閲覧のみ） */
  uid: string | null;
  /** 共有ドキュメントを購読する。null はゲームがない */
  subscribe(cb: (doc: GameDoc | null) => void, onError: (msg: string) => void): () => void;
  /** ドキュメント全体を書き込む */
  write(doc: GameDoc): Promise<void>;
  /** ドキュメントを消す（新しいゲームを作り直すとき） */
  clear(): Promise<void>;
  /**
   * 読んで・変えて・書くを、ほかの人の書き込みと食い違わないように行う（席を取る、名前を変えるなど）。
   * mutate が null を返したら書かずに false。書けたら true
   */
  transact(mutate: (doc: GameDoc) => GameDoc | null): Promise<boolean>;
}

const PATH = 'games/current';

function isGameDoc(x: unknown): x is GameDoc {
  const d = x as GameDoc;
  return !!d && (d.status === 'lobby' || d.status === 'playing') && Array.isArray(d.moves) && Array.isArray(d.seats) && typeof d.seed === 'number' && !!d.config;
}

// ---- Claude の共有データベース（アーティファクトの db capability） ----

interface DbDoc {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  acquire(o: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean }>;
  onSnapshot(next: (s: { exists: boolean; data(): Record<string, unknown> | undefined }) => void, err?: (e: { code: string; message: string }) => void): () => void;
}
interface DbNs {
  doc(path: string): DbDoc;
}
interface UserNs {
  id(): Promise<string | null>;
}
type ClaudeWin = { claude?: { use(name: string): Promise<unknown> } };

/** アーティファクトとして開かれていて、共有データベースが使えるときだけ Room を返す */
export async function connectClaudeRoom(): Promise<Room | null> {
  const c = (window as unknown as ClaudeWin).claude;
  if (!c?.use) return null;
  const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [DbNs | null, UserNs | null];
  if (!db) return null;
  const uid = user ? await user.id() : null;
  const ref = db.doc(PATH);
  const retryOnce = async (f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      if ((e as { code?: string }).code !== 'unavailable') throw e;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      await f();
    }
  };
  return {
    uid,
    subscribe(cb, onError) {
      return ref.onSnapshot(
        (snap) => {
          const d = snap.exists ? snap.data() : undefined;
          cb(isGameDoc(d) ? d : null);
        },
        (e) => onError(e.code === 'revoked' ? 'このページへのアクセスが変わりました。開き直してください。' : `共有データを読めませんでした（${e.code}）`),
      );
    },
    write: (doc) => retryOnce(() => ref.set(doc as unknown as Record<string, unknown>)),
    clear: () => retryOnce(() => ref.delete()),
    // 短い貸し出し（lease）の中で読んでから書く
    async transact(mutate) {
      if (!uid) return false;
      const lease = await ref.acquire({ holder: uid, ttlMs: 3000 });
      if (!lease.acquired) return false;
      const snap = await ref.get();
      const d = snap.exists ? snap.data() : undefined;
      const next = isGameDoc(d) ? mutate(d) : null;
      if (!next) return false;
      await ref.set(next as unknown as Record<string, unknown>);
      return true;
    },
  };
}

// ---- 開発・検査用の代わり（同じブラウザのタブ同士で localStorage を共有する） ----
// ?fakedb=1&uid=<名前> で開くと使う。e2e の複数人対戦の検査に使い、配布物の利用者には出ない。

const FAKE_KEY = 'sweetlands.fakedb.games/current';

export function connectFakeRoom(uid: string): Room {
  const read = (): GameDoc | null => {
    try {
      const raw = localStorage.getItem(FAKE_KEY);
      const d = raw ? JSON.parse(raw) : null;
      return isGameDoc(d) ? d : null;
    } catch {
      return null;
    }
  };
  const listeners = new Set<(d: GameDoc | null) => void>();
  const notify = () => listeners.forEach((f) => f(read()));
  window.addEventListener('storage', (e) => {
    if (e.key === FAKE_KEY) notify();
  });
  const put = async (d: GameDoc | null) => {
    if (d) localStorage.setItem(FAKE_KEY, JSON.stringify(d));
    else localStorage.removeItem(FAKE_KEY);
    notify(); // storage イベントは書いたタブ自身には届かない
  };
  return {
    uid,
    subscribe(cb) {
      listeners.add(cb);
      setTimeout(() => cb(read()), 0);
      return () => listeners.delete(cb);
    },
    write: (d) => put(d),
    clear: () => put(null),
    async transact(mutate) {
      const d = read();
      const next = d ? mutate(d) : null;
      if (!next) return false;
      await put(next);
      return true;
    },
  };
}
