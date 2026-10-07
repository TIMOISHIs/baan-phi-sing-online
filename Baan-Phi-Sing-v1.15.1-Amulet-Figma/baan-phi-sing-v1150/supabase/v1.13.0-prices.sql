-- Change purchase prices only. Keeps wallets, ownership and XP. Safe to reapply.
begin;
create or replace function public.buy_character(p_user_id uuid,p_character_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cost integer; balance bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden';end if;
 cost:=case p_character_key when 'por-krai' then 250 when 'black-shaman' then 250 when 'temple-dog' then 250 when 'stray-cat' then 250 else null end;
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

commit;
