'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
async function main(){
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role; create schema if not exists public; create table public.profiles(id uuid primary key);');
  const migration=fs.readFileSync(path.join(__dirname,'supabase/v1.14.0-friends.sql'),'utf8');await db.exec(migration);await db.exec(migration);
  const a='8dc3c20e-228c-45bd-a6d8-5acfd13644d1',b='4ac6a7a5-3c8e-4a0f-8d90-cc66cb741826';
  const c='7efb3902-0749-43c9-8f04-1150b2c65ce5';
  await db.query('insert into public.profiles(id) values($1),($2),($3)',[a,b,c]);
  await db.query('insert into public.friendships(user_low,user_high,requested_by) values($1,$2,$2)',[b,a]);
  let result=await db.query('select status from public.friendships');assert.equal(result.rows[0].status,'pending');
  await assert.rejects(()=>db.query('insert into public.friendships(user_low,user_high,requested_by) values($1,$2,$1)',[b,a]),/unique/i,'duplicate pair must be blocked');
  await assert.rejects(()=>db.query('insert into public.friendships(user_low,user_high,requested_by) values($1,$2,$3)',[a,b,'7efb3902-0749-43c9-8f04-1150b2c65ce5']),/check/i,'requester must belong to the pair');
  await db.query('insert into public.friend_presence(user_id) values($1) on conflict(user_id) do update set last_seen=now()', [a]);
  result=await db.query('select count(*)::int as n from public.friend_presence');assert.equal(result.rows[0].n,1);
  result=await db.query("select relrowsecurity from pg_class where oid='public.friendships'::regclass");assert.equal(result.rows[0].relrowsecurity,true,'friend records are protected by RLS');
  console.log('PASS: Supabase friends migration constraints, presence table and RLS');
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
