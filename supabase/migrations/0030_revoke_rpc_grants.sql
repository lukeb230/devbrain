-- The AI budget RPCs and my_org_ids() are SECURITY DEFINER and were only ever
-- meant to be called by the server with the service role. PostgREST exposes
-- every public function to anon/authenticated by default, which let anyone
-- holding an org UUID drain that org's daily AI cap through /rest/v1/rpc/.
-- The service role bypasses grants, so the app is unaffected.

revoke execute on function public.ai_reserve(uuid) from anon, authenticated, public;
revoke execute on function public.ai_record(uuid, bigint, bigint) from anon, authenticated, public;
revoke execute on function public.my_org_ids() from anon, public;
-- my_org_ids() is referenced by RLS policies evaluated as the signed-in user,
-- so authenticated keeps EXECUTE; it returns nothing without a session anyway.
