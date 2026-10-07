const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=require('./manifest.json');
let root=process.cwd();
if(!fs.existsSync(path.join(root,'server.js')))root=path.dirname(__dirname);
if(!fs.existsSync(path.join(root,'server.js'))||!fs.existsSync(path.join(root,'public/app.js')))throw Error('เปิด Terminal ที่โฟลเดอร์หลักเกม ซึ่งมี server.js และ public แล้วรันอีกครั้ง');
let changes=[];
for(const [name,info] of Object.entries(manifest)){
 const dest=path.join(root,name),payload=path.join(__dirname,'files',name);
 if(hash(fs.readFileSync(payload))!==info.after)throw Error('ไฟล์แพตช์ไม่สมบูรณ์: '+name);
 const current=fs.existsSync(dest)?hash(fs.readFileSync(dest)):null;
 if(current===info.after)continue;
 if(current!==info.before)throw Error('ไฟล์ '+name+' ต่างจากฐาน v1.14.5 จึงยังไม่ติดตั้งเพื่อป้องกันทับงานใหม่ ส่งข้อความนี้ให้มีนาตรวจสอบ');
 changes.push(name);
}
if(!changes.length){console.log('ติดตั้ง v1.14.6 แล้ว ไม่ต้องติดตั้งซ้ำ');process.exit(0)}
for(const name of ['public/app.js','public/pregame-ui.js'])cp.execFileSync(process.execPath,['--check',path.join(__dirname,'files',name)]);
const backup=path.join(root,'.patch-backups','v1.14.6-'+Date.now());fs.mkdirSync(backup,{recursive:true});
for(const name of changes){const src=path.join(root,name);if(fs.existsSync(src)){const dest=path.join(backup,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}}
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
try{for(const name of changes){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,'files',name),dest);}}
catch(e){for(const name of changes){const saved=path.join(backup,name),dest=path.join(root,name);if(fs.existsSync(saved))fs.copyFileSync(saved,dest);else if(manifest[name].before===null&&fs.existsSync(dest))fs.unlinkSync(dest);}throw e;}
console.log('ติดตั้ง v1.14.6 สำเร็จ พร้อม Commit และ Push');console.log('สำรองไฟล์เดิม: '+backup);console.log('ยังไม่ได้ Deploy ไป Railway');
