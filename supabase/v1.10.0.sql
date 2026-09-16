-- Run once in this game's Supabase SQL Editor. No existing game tables are dropped.
begin;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 2 and 18),
 avatar_key text not null,
 total_xp bigint not null default 0 check(total_xp>=0),
 games_played integer not null default 0 check(games_played>=0),
 wins integer not null default 0 check(wins>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.completed_matches (
 id uuid primary key, defeat boolean not null, created_at timestamptz not null default now()
);
create table if not exists public.match_results (
 match_id uuid not null references public.completed_matches(id),
 user_id uuid not null references public.profiles(id),
 rank integer not null check(rank between 1 and 6),
 xp integer not null check(xp between 50 and 150), score integer not null,
 created_at timestamptz not null default now(),primary key(match_id,user_id)
);
create index if not exists match_results_user_time on public.match_results(user_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.completed_matches enable row level security;
alter table public.match_results enable row level security;
revoke all on public.profiles, public.completed_matches, public.match_results from anon,authenticated;
grant select on public.profiles, public.match_results to authenticated;
grant all on public.profiles, public.completed_matches, public.match_results to service_role;
drop policy if exists own_profile_read on public.profiles;
create policy own_profile_read on public.profiles for select to authenticated using((select auth.uid())=id);
drop policy if exists own_results_read on public.match_results;
create policy own_results_read on public.match_results for select to authenticated using((select auth.uid())=user_id);
create or replace function public.award_match(p_match_id uuid,p_results jsonb,p_defeat boolean)
returns void language plpgsql security definer set search_path='' as $$
declare n integer; inserted integer; item record; bonus integer; position integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 n:=jsonb_array_length(p_results);
 if n<2 or n>6 or p_defeat is null then raise exception 'Invalid match'; end if;
 if (select count(distinct r.user_id) from jsonb_to_recordset(p_results) as r(user_id uuid,score integer))<>n then raise exception 'Invalid participants'; end if;
 if exists(select 1 from jsonb_to_recordset(p_results) as r(user_id uuid,score integer) where r.score is null or r.user_id is null) then raise exception 'Invalid result';end if;
 insert into public.completed_matches(id,defeat) values(p_match_id,p_defeat) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return;end if;
 -- Lock profiles consistently to avoid deadlocks when two matches complete together.
 perform 1 from public.profiles where id in(select r.user_id from jsonb_to_recordset(p_results) as r(user_id uuid,score integer)) order by id for update;
 for item in select * from jsonb_to_recordset(p_results) as r(user_id uuid,score integer) loop
  select 1+count(*) into position from jsonb_to_recordset(p_results) as r(user_id uuid,score integer) where r.score>item.score;
  select case when p_defeat then 0 else 20*count(*) end into bonus from jsonb_to_recordset(p_results) as r(user_id uuid,score integer) where r.score<item.score;
  insert into public.match_results(match_id,user_id,rank,xp,score) values(p_match_id,item.user_id,position,50+bonus,item.score);
  update public.profiles set total_xp=total_xp+50+bonus,games_played=games_played+1,wins=wins+case when position=1 and not p_defeat then 1 else 0 end where id=item.user_id;
 end loop;
end;$$;
revoke all on function public.award_match(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.award_match(uuid,jsonb,boolean) to service_role;
commit;
