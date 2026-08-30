-- Advisor: memory_search had a role-mutable search_path. Pinned.
alter function public.memory_search(uuid, text, integer, text) set search_path = public;
