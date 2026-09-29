'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=__dirname,target=process.cwd(),manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
function stop(t){console.error('หยุดก่อน: '+t);process.exit(1)}
if(!fs.existsSync(path.join(target,'server.js'))||!fs.existsSync(path.join(target,'lib/accounts.cjs')))stop('เปิด Terminal ในโฟลเดอร์หลักเกมที่มี server.js, package.json, public และ lib แล้วรันใหม่');
// These two approved variants were supplied by the game owner and differ only by a final blank line.
// Accept only their exact hashes; unrelated local changes still stop installation.
const approvedBaseVariants={
 'public/accounts.js':'a4dca8a04b228c227a93a7a811386f0913d4c2cd65ec2a7174123adb7540fa01',
 'public/styles.css':'6896e6bfa8d2d888a88aac869be0618f3c3484e772dc3dc6b1b18392bc0759e8'
};
const conflicts=[];for(const f of manifest.files){if(sha(path.join(source,'files',f.path))!==f.next)stop('ไฟล์แพตช์ไม่ครบ: '+f.path);const current=sha(path.join(target,f.path));if(current!==f.base&&current!==f.next&&current!==approvedBaseVariants[f.path])conflicts.push(f.path)}
if(conflicts.length)stop('ไฟล์เหล่านี้ไม่ตรงกับ v1.13.2 จึงยังไม่เขียนทับ ส่งรายชื่อให้มีนาดู:\n'+conflicts.join('\n'));
if(process.argv.includes('--check')){console.log('CHECK PASSED — พบไฟล์ v1.13.2 พร้อมติดตั้ง Friends Update v1.14.0');process.exit(0)}
const changed=manifest.files.filter(f=>sha(path.join(target,f.path))!==f.next);if(!changed.length){console.log('ติดตั้ง v1.14.0 ครบแล้ว ไม่ต้องคัดลอกซ้ำ');process.exit(0)}
const backup=path.join(source,'backup-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup,{recursive:true});
const history=changed.map(f=>({path:f.path,existed:fs.existsSync(path.join(target,f.path))}));fs.writeFileSync(path.join(backup,'restore-manifest.json'),JSON.stringify(history,null,2));
for(const f of history)if(f.existed){const dest=path.join(backup,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(target,f.path),dest)}
try{for(const f of changed){const dest=path.join(target,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,'files',f.path),dest+'.v1140-tmp');fs.renameSync(dest+'.v1140-tmp',dest)}}catch(e){for(const f of history){const dest=path.join(target,f.path);if(f.existed)fs.copyFileSync(path.join(backup,f.path),dest);else fs.rmSync(dest,{force:true});fs.rmSync(dest+'.v1140-tmp',{force:true})}throw e}
console.log('ติดตั้ง Friends Update v1.14.0 เรียบร้อย '+changed.length+' ไฟล์\nสำรองไฟล์เดิมไว้ที่ '+backup+'\nขั้นต่อไป: เปิดไฟล์ supabase/v1.14.0-friends.sql แล้วรันใน Supabase SQL Editor');
