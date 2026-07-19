-- Allow client (anon + authenticated) to read published learning resources
grant select on public.learning_resources to anon, authenticated;
grant select on public.resource_knowledge_tags to anon, authenticated;
