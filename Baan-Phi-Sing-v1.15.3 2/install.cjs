'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const patch=__dirname,manifest=require('./manifest.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const digest=p=>fs.existsSync(p)?hash(fs.readFileSync(p)):null;
function isGame(p){return fs.existsSync(path.join(p,'server.js'))&&fs.existsSync(path.join(p,'public/app.js'))&&fs.existsSync(path.join(p,'package.json'));}
function main(){
 const candidates=[process.cwd(),path.dirname(patch)];
 const root=candidates.find(p=>isGame(p)&&path.resolve(p)!==path.resolve(patch));
 if(!root)throw Error('วางโฟลเดอร์ Baan-Phi-Sing-v1.15.3 ข้าง server.js ในโฟลเดอร์หลักเกม แล้วรันใหม่');
 const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 let inGit=false;try{inGit=git(['rev-parse','--is-inside-work-tree'])==='true';}catch{}
 const changed=[];
 for(const [name,info] of Object.entries(manifest.files)){
  if(path.isAbsolute(name)||name.split('/').includes('..'))throw Error('ชื่อไฟล์แพตช์ไม่ถูกต้อง');
  if(digest(path.join(patch,'files',name))!==info.after)throw Error('ไฟล์แพตช์ไม่สมบูรณ์: '+name);
  const current=digest(path.join(root,name));
  if(current===info.after)continue;
  if(current!==info.before)throw Error('ไฟล์ '+name+' ต่างจากฐาน v1.15.2 ยังไม่ได้ติดตั้ง ส่งข้อความนี้ให้มีนาตรวจ');
  changed.push(name);
 }
 if(!changed.length){console.log('ติดตั้ง v1.15.3 แล้ว ไม่ต้องติดตั้งซ้ำ');return;}
 for(const name of ['public/layout1153.js'])cp.execFileSync(process.execPath,['--check',path.join(patch,'files',name)],{stdio:'inherit'});
 if(process.argv.includes('--check')){console.log('พร้อมติดตั้ง v1.15.3: '+changed.length+' ไฟล์ (ยังไม่แก้ไขไฟล์เกม)');return;}
 if(inGit&&git(['diff','--cached','--name-only']))throw Error('มีไฟล์อื่น Stage ค้างไว้ กรุณา Commit หรือ Unstage งานเดิมก่อน แล้วค่อยรันแพตช์นี้');
 const backup=path.join(root,'.patch-backups','v1.15.3-'+Date.now());
 fs.mkdirSync(backup,{recursive:true});
 for(const name of changed){const src=path.join(root,name);if(fs.existsSync(src)){const saved=path.join(backup,name);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(src,saved);}}
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2));
 try{
  for(const name of changed){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(patch,'files',name),dest);}
 }catch(error){
  for(const name of changed){const saved=path.join(backup,name),dest=path.join(root,name);if(fs.existsSync(saved))fs.copyFileSync(saved,dest);else if(manifest.files[name].before===null&&fs.existsSync(dest))fs.unlinkSync(dest);}
  throw error;
 }
 if(inGit){
  git(['add','--',...Object.keys(manifest.files)]);
  // Local ignores keep the upload and backup copies out of future commits.
  const exclude=path.resolve(root,git(['rev-parse','--git-path','info/exclude']));
  const existing=fs.existsSync(exclude)?fs.readFileSync(exclude,'utf8'):'';
  const patterns=['.patch-backups/','Baan-Phi-Sing-v1.15.3/','Baan-Phi-Sing-v1.15.3.zip'];
  const missing=patterns.filter(p=>!existing.split(/\r?\n/).includes(p));
  if(missing.length){fs.mkdirSync(path.dirname(exclude),{recursive:true});fs.appendFileSync(exclude,'\n'+missing.join('\n')+'\n');}
 }
 console.log('ติดตั้ง v1.15.3 สำเร็จ พร้อม Commit และ Push');
 console.log('สำรองไฟล์เดิม: '+backup);
 if(inGit)console.log('Stage เฉพาะไฟล์แพตช์แล้ว ทำตาม README-TH.md เพื่อ Commit และ Push');
 else console.log('โฟลเดอร์นี้ไม่ได้อยู่ใน Git repository: ติดตั้งไฟล์แล้ว แต่ยังไม่ได้ Stage');
 console.log('ยังไม่ได้ Deploy ไป Railway และไม่ได้เปลี่ยน Supabase');
}
try{main();}catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
