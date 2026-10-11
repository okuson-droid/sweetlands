-- スイーツランドのオンライン対戦用テーブル（Supabase の SQL Editor に貼り付けて、そのまま Run する）。
-- 匿名ログインした人だけが読み書きできる。ゲームを消せるのは作った人だけ。友達どうしの対戦を前提にした最小限のルール。

create table if not exists public.games (
  id text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

grant select, insert, update, delete on public.games to authenticated;

drop policy if exists "games_read" on public.games;
drop policy if exists "games_insert" on public.games;
drop policy if exists "games_update" on public.games;
drop policy if exists "games_delete" on public.games;

create policy "games_read" on public.games
  for select to authenticated using (true);

create policy "games_insert" on public.games
  for insert to authenticated
  with check (doc ? 'status' and doc ? 'seats' and doc ? 'moves' and jsonb_array_length(doc->'moves') < 5000);

create policy "games_update" on public.games
  for update to authenticated using (true)
  with check (doc ? 'status' and doc ? 'seats' and doc ? 'moves' and jsonb_array_length(doc->'moves') < 5000);

create policy "games_delete" on public.games
  for delete to authenticated using (doc->>'creator' = auth.uid()::text);

-- 変更をリアルタイムで各画面に届ける
do $$
begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;
