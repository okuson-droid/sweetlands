// オンライン対戦の共有状態を Supabase（Postgres ＋ Realtime）に置く版（decisions §11）。
// 友達はアカウント不要：Supabase の匿名ログインで、ブラウザごとに利用者 ID を作る（席はこの ID で覚える）。
// 設定はページの window.SWEETLANDS_SUPABASE（index.html の head にある設定欄）から読む。秘密の値ではない。
// テーブルは public.games（id text 主キー、doc jsonb）。作り方は deploy/supabase_setup.sql。
import { createClient } from '@supabase/supabase-js';
import type { GameDoc, Room } from './room';

type SupabaseConfig = { url: string; key: string };

export function supabaseConfigured(): SupabaseConfig | null {
  const c = (window as unknown as { SWEETLANDS_SUPABASE?: SupabaseConfig }).SWEETLANDS_SUPABASE;
  return c && c.url && c.key && !c.url.startsWith('ここに') && !c.key.startsWith('ここに') ? c : null;
}

function isGameDoc(x: unknown): x is GameDoc {
  const d = x as GameDoc;
  return !!d && (d.status === 'lobby' || d.status === 'playing') && Array.isArray(d.moves) && Array.isArray(d.seats) && typeof d.seed === 'number' && !!d.config;
}

/** URL の ?g=名前 でゲームを分けられる（省略時は 1つのゲーム "current"） */
function gameId(): string {
  const g = new URLSearchParams(location.search).get('g') ?? 'current';
  return g.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'current';
}

const POLL_MS = 8000;

export async function connectSupabaseRoom(cfg: SupabaseConfig): Promise<Room> {
  const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
  let session = (await sb.auth.getSession()).data.session;
  if (!session) {
    const r = await sb.auth.signInAnonymously();
    if (r.error) throw r.error;
    session = r.data.session;
  }
  if (!session) throw new Error('anonymous sign-in returned no session');
  const uid = session.user.id;
  const gid = gameId();

  const fetchDoc = async (): Promise<GameDoc | null> => {
    const { data, error } = await sb.from('games').select('doc').eq('id', gid).maybeSingle();
    if (error) throw error;
    return data && isGameDoc(data.doc) ? data.doc : null;
  };

  return {
    uid,
    subscribe(cb, onError) {
      // 通知の順序入れ替わりに備え、同じゲーム（同じ seed）で version が戻る更新は捨てる
      // 取り直しで中身が変わっていないときは知らせない
      let current: GameDoc | null | undefined;
      let currentJson = '';
      let alive = true;
      const deliver = (d: GameDoc | null) => {
        if (!alive) return;
        if (d && current && d.seed === current.seed && d.version < current.version) return;
        const json = JSON.stringify(d);
        if (current !== undefined && json === currentJson) return;
        current = d;
        currentJson = json;
        cb(d);
      };
      const refresh = () =>
        fetchDoc().then(deliver, (e: { code?: string; message?: string }) => onError(`共有データを読めませんでした（${e.code ?? e.message ?? 'error'}）`));
      const channel = sb
        .channel(`game-${gid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'games', filter: `id=eq.${gid}` }, (p) => deliver(isGameDoc((p.new as { doc?: unknown }).doc) ? (p.new as { doc: GameDoc }).doc : null))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gid}` }, (p) => deliver(isGameDoc((p.new as { doc?: unknown }).doc) ? (p.new as { doc: GameDoc }).doc : null))
        // 削除の通知は絞り込みができないため、全件を受けて id で見分ける
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'games' }, (p) => {
          if ((p.old as { id?: string }).id === gid) deliver(null);
        })
        .subscribe((status) => {
          // 購読がつながった（つなぎ直した）ときに最新を取り直す。取りこぼしをなくすため
          if (status === 'SUBSCRIBED') refresh();
        });
      // 通知が落ちたときの保険：画面が表示中なら一定間隔で取り直す
      const timer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh();
      }, POLL_MS);
      refresh();
      return () => {
        alive = false;
        clearInterval(timer);
        sb.removeChannel(channel);
      };
    },
    async write(d) {
      const { error } = await sb.from('games').upsert({ id: gid, doc: d, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async clear() {
      const { error } = await sb.from('games').delete().eq('id', gid);
      if (error) throw error;
    },
    // 読んだときの version のままなら書く（楽観的な排他）。先を越されたら読み直して数回まで試す
    async transact(mutate) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const d = await fetchDoc();
        const next = d ? mutate(d) : null;
        if (!d || !next) return false;
        const { data, error } = await sb
          .from('games')
          .update({ doc: next, updated_at: new Date().toISOString() })
          .eq('id', gid)
          .eq('doc->>version', String(d.version))
          .select('id');
        if (error) throw error;
        if (data && data.length) return true;
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
      }
      return false;
    },
  };
}
