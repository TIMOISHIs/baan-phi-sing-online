'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=__dirname,target=process.cwd(),manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const sha=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
function stop(t){console.error('หยุดก่อน: '+t);process.exit(1)}
if(!fs.existsSync(path.join(target,'server.js'))||!fs.existsSync(path.join(target,'lib/accounts.cjs')))stop('เปิด Terminal ในโฟลเดอร์หลักเกมที่มี server.js, package.json, public และ lib แล้วรันใหม่');
const conflicts=[];for(const f of manifest.files){if(sha(path.join(source,'files',f.path))!==f.next)stop('ไฟล์แพตช์ไม่ครบ: '+f.path);const current=sha(path.join(target,f.path));if(current!==f.base&&current!==f.next)conflicts.push(f.path)}
if(conflicts.length)stop('ไฟล์เหล่านี้ไม่ตรงกับ v1.14.0 จึงยังไม่เขียนทับ ส่งรายชื่อให้มีนาดู:\n'+conflicts.join('\n'));
if(process.argv.includes('--check')){console.log('CHECK PASSED — พบไฟล์ v1.14.0 พร้อมติดตั้ง Lobby Update v1.14.1');process.exit(0)}
const changed=manifest.files.filter(f=>sha(path.join(target,f.path))!==f.next);if(!changed.length){console.log('ติดตั้ง v1.14.1 ครบแล้ว ไม่ต้องคัดลอกซ้ำ');process.exit(0)}
const backup=path.join(source,'backup-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup,{recursive:true});
const history=changed.map(f=>({path:f.path,existed:fs.existsSync(path.join(target,f.path))}));fs.writeFileSync(path.join(backup,'restore-manifest.json'),JSON.stringify(history,null,2));
for(const f of history)if(f.existed){const dest=path.join(backup,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(target,f.path),dest)}
try{for(const f of changed){const dest=path.join(target,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,'files',f.path),dest+'.v1141-tmp');fs.renameSync(dest+'.v1141-tmp',dest)}}catch(e){for(const f of history){const dest=path.join(target,f.path);if(f.existed)fs.copyFileSync(path.join(backup,f.path),dest);else fs.rmSync(dest,{force:true});fs.rmSync(dest+'.v1141-tmp',{force:true})}throw e}
console.log('ติดตั้ง Lobby Update v1.14.1 เรียบร้อย '+changed.length+' ไฟล์\nสำรองไฟล์เดิมไว้ที่ '+backup+'\nขั้นต่อไป: npm test แล้ว commit/push เฉพาะไฟล์ของแพตช์เมื่อเกมที่กำลังเล่นจบแล้ว');
