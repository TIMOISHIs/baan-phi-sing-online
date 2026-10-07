-- Apply after v1.10.0.sql. No existing profile, XP or match records are removed.
begin;
create table if not exists public.wallets(user_id uuid primary key references public.profiles(id),baht bigint not null default 0 check(baht>=0));
create table if not exists public.character_ownership(user_id uuid not null references public.profiles(id),character_key text not null,purchased_at timestamptz not null default now(),primary key(user_id,character_key));
create table if not exists public.wallet_ledger(id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id),amount integer not null,reason text not null,reference text not null,created_at timestamptz not null default now(),unique(user_id,reason,reference));
alter table public.wallets enable row level security;
alter table public.character_ownership enable row level security;
alter table public.wallet_ledger enable row level security;
revoke all on public.wallets,public.character_ownership,public.wallet_ledger from anon,authenticated;
grant all on public.wallets,public.character_ownership,public.wallet_ledger to service_role;
grant usage,select on sequence public.wallet_ledger_id_seq to service_role;

create or replace function public.buy_character(p_user_id uuid,p_character_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cost integer; balance bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden';end if;
 cost:=case p_character_key when 'por-krai' then 250 when 'black-shaman' then 500 when 'temple-dog' then 600 when 'stray-cat' then 600 else null end;
 if cost is null then return jsonb_build_object('ok',false,'error','ตัวละครนี้ซื้อไม่ได้');end if;
 insert into public.wallets(user_id) values(p_user_id) on conflict do nothing;
 select baht into balance from public.wallets where user_id=p_user_id for update;
 if exists(select 1 from public.character_ownership where user_id=p_user_id and character_key=p_character_key) then return jsonb_build_object('ok',true,'alreadyOwned',true);end if;
 if balance<cost then return jsonb_build_object('ok',false,'error','เงินบาทไม่เพียงพอ');end if;
 update public.wallets set baht=baht-cost where user_id=p_user_id;
 insert into public.character_ownership(user_id,character_key) values(p_user_id,p_character_key);
 insert into public.wallet_ledger(user_id,amount,reason,reference) values(p_user_id,-cost,'purchase',p_character_key);
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.buy_character(uuid,text) from public,anon,authenticated;
grant execute on function public.buy_character(uuid,text) to service_role;

create or replace function public.reward_match_wallet()
returns trigger language plpgsql security definer set search_path='' as $$
declare reward integer; inserted integer;
begin
 reward:=110-10*new.rank;
 insert into public.wallets(user_id) values(new.user_id) on conflict do nothing;
 insert into public.wallet_ledger(user_id,amount,reason,reference) values(new.user_id,reward,'match',new.match_id::text) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted>0 then update public.wallets set baht=baht+reward where user_id=new.user_id;end if;
 return new;
end;$$;
revoke all on function public.reward_match_wallet() from public,anon,authenticated;
drop trigger if exists match_wallet_reward on public.match_results;
create trigger match_wallet_reward after insert on public.match_results for each row execute function public.reward_match_wallet();
commit;
