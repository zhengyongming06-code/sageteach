-- Idempotent: ensure RLS policies exist for review_summaries (fixes insert denied for authenticated users).
alter table public.review_summaries enable row level security;

drop policy if exists "review_summaries self read" on public.review_summaries;
create policy "review_summaries self read" on public.review_summaries
  for select using (auth.uid() = user_id);

drop policy if exists "review_summaries self insert" on public.review_summaries;
create policy "review_summaries self insert" on public.review_summaries
  for insert with check (auth.uid() = user_id);

drop policy if exists "review_summaries self delete" on public.review_summaries;
create policy "review_summaries self delete" on public.review_summaries
  for delete using (auth.uid() = user_id);
