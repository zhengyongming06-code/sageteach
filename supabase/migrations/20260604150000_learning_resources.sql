-- P3 scaffold: learning resources (videos + questions) tagged to knowledge points
-- Client seed data in src/lib/knowledge-topics until admin curation UI ships

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('video', 'question')),
  title text not null,
  description text,
  external_url text,
  platform text check (platform in ('bilibili', 'internal', 'other')),
  teacher text,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  stem text,
  answer_hint text,
  source_label text,
  difficulty smallint check (difficulty is null or (difficulty >= 1 and difficulty <= 3)),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_resources_content_check check (
    (resource_type = 'video' and external_url is not null)
    or (resource_type = 'question' and stem is not null)
  )
);

create index learning_resources_type_status_idx
  on public.learning_resources (resource_type, status);

create table public.resource_knowledge_tags (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources (id) on delete cascade,
  subject text not null,
  knowledge_point text not null,
  catalog_node_id uuid references public.kg_catalog_nodes (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint resource_knowledge_tags_unique unique (resource_id, subject, knowledge_point)
);

create index resource_knowledge_tags_lookup_idx
  on public.resource_knowledge_tags (subject, knowledge_point);

alter table public.learning_resources enable row level security;
alter table public.resource_knowledge_tags enable row level security;

create policy "learning_resources read published" on public.learning_resources
  for select using (status = 'published');

create policy "resource_knowledge_tags read all" on public.resource_knowledge_tags
  for select using (true);

comment on table public.learning_resources is 'Curated videos and practice questions for knowledge topic pages';
comment on table public.resource_knowledge_tags is 'Many-to-many tags linking resources to subject + knowledge_point names';
