-- Grade level for grade-filtered diagnostics (may already exist on older projects).
alter table public.profiles add column if not exists grade text;
