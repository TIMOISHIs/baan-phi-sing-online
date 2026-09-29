-- Baan Phi Sing v1.14.0: persistent friend requests and online presence.
-- Run in Supabase SQL Editor after v1.10.0.sql has created public.profiles.
-- No player profile, XP, wallet, inventory, or match rows are changed.
begin;

create table if not exists public.friendships (
 id uuid primary key default gen_random_uuid(),
 user_low uuid not null references public.profiles(id) on delete cascade,
 user_high uuid not null references public.profiles(id) on delete cascade,
 requested_by uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 accepted_at timestamptz,
 constraint friendships_pair_order check(user_low < user_high),
 constraint friendships_requester_is_member check(requested_by=user_low or requested_by=user_high),
 constraint friendships_not_self check(user_low<>user_high),
 constraint friendships_unique_pair unique(user_low,user_high)
);
create index if not exists friendships_user_low_status on public.friendships(user_low,status,created_at desc);
create index if not exists friendships_user_high_status on public.friendships(user_high,status,created_at desc);

create table if not exists public.friend_presence (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 last_seen timestamptz not null default now()
);
create index if not exists friend_presence_last_seen on public.friend_presence(last_seen desc);

alter table public.friendships enable row level security;
alter table public.friend_presence enable row level security;
revoke all on public.friendships,public.friend_presence from public,anon,authenticated;
grant select,insert,update,delete on public.friendships to service_role;
grant select,insert,update,delete on public.friend_presence to service_role;
commit;
