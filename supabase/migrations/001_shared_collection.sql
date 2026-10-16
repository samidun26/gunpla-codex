begin;

-- Editor emails are private. Add the two approved emails in the SQL editor, not Git.
create table public.gunpla_editors (
  email text primary key check (email = lower(email) and length(email) between 3 and 254)
);
alter table public.gunpla_editors enable row level security;
revoke all on public.gunpla_editors from public,anon,authenticated;
grant select on public.gunpla_editors to authenticated;
create policy "Editors can check only their own membership"
  on public.gunpla_editors for select to authenticated
  using (email = lower((select auth.jwt()->>'email')));

create function public.can_edit_gunpla()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.gunpla_editors
    where email = lower((select auth.jwt()->>'email'))
  );
$$;
revoke all on function public.can_edit_gunpla() from public,anon;
grant execute on function public.can_edit_gunpla() to authenticated;

create table public.gunpla_library (
  id text primary key check (id = 'shared'),
  state jsonb not null default '{"version":1,"entries":{},"customKits":[]}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  constraint valid_library_shape check (
    jsonb_typeof(state) = 'object'
    and state->'version' = '1'::jsonb
    and jsonb_typeof(state->'entries') = 'object'
    and jsonb_typeof(state->'customKits') = 'array'
    and state ?& array['version','entries','customKits']
    and octet_length(state::text) <= 5242880
  )
);
insert into public.gunpla_library (id) values ('shared');
alter table public.gunpla_library enable row level security;
revoke all on public.gunpla_library from public,anon,authenticated;
grant select on public.gunpla_library to anon,authenticated;
grant update (state,revision) on public.gunpla_library to authenticated;
create policy "Anyone can view the shared collection"
  on public.gunpla_library for select to anon,authenticated using (true);
create policy "Approved editors can update the shared collection"
  on public.gunpla_library for update to authenticated
  using ((select public.can_edit_gunpla()))
  with check ((select public.can_edit_gunpla()) and id = 'shared');

commit;
