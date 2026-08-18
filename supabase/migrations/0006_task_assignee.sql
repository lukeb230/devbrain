-- Tasks can be assigned to a team member (display name; picked from the
-- org's member list in the UI, or set by an agent via the API).
alter table tasks add column if not exists assigned_to text;
