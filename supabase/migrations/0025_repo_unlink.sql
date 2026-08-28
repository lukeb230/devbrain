-- Repo unlink. Soft by default: unlinked_at set → the repo drops out of every
-- listing and the agent API refuses it, but its history (tasks, journals,
-- PRs, brain index…) stays. Reinstalling the GitHub App on it clears the
-- flag. "Unlink and delete" removes the row and cascades everything.
-- GitHub-side removals (repo removed from the installation, app uninstalled)
-- now soft-unlink instead of deleting — they used to destroy history.
alter table linked_repos add column if not exists unlinked_at timestamptz;
create index if not exists linked_repos_active_idx on linked_repos (org_id) where unlinked_at is null;
