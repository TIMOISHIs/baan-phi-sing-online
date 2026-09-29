'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const manifest=require('./manifest.json');let root=process.cwd();
if(!fs.existsSync(path.join(root,'server.js'))||!fs.existsSync(path.join(root,'public','app.js')))throw Error('เปิด Terminal ที่โฟลเดอร์หลักเกม ซึ่งมี server.js, package.json และ public แล้วรันคำสั่งนี้');
const changes=[];
for(const [name,info] of Object.entries(manifest)){
 const payload=path.join(__dirname,'files',name),dest=path.join(root,name);
 if(hash(payload)!==info.after)throw Error('ไฟล์ใน ZIP ไม่ครบหรือเสียหาย: '+name);
 const current=fs.existsSync(dest)?hash(dest):null;
 if(current===info.after)continue;
 if(current!==info.before)throw Error('ไฟล์ '+name+' ไม่ตรงกับ v1.14.2 จึงหยุดโดยไม่เขียนทับงานปัจจุบัน กรุณาส่งข้อความนี้ให้มีนาตรวจ');
 changes.push(name);
}
if(!changes.length){console.log('ติดตั้ง v1.14.3 อยู่แล้ว ไม่ต้องติดตั้งซ้ำ');process.exit(0)}
require('child_process').execFileSync(process.execPath,['--check',path.join(__dirname,'files','public/accounts.js')]);
const backup=path.join(root,'.patch-backups','v1.14.3-'+Date.now());fs.mkdirSync(backup,{recursive:true});
for(const name of changes){const dest=path.join(root,name),saved=path.join(backup,name);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(dest,saved)}
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
try{for(const name of changes){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,'files',name),dest)}}catch(e){for(const name of changes)fs.copyFileSync(path.join(backup,name),path.join(root,name));throw e}
console.log('ติดตั้ง v1.14.3 สำเร็จ — สำรองไฟล์ไว้ที่ '+backup);console.log('ยังไม่ได้ Commit, Push หรือ Deploy');
