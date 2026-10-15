'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const manifest=require('./manifest.json'),root=process.cwd();
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function run(cmd,args,options={}){return cp.execFileSync(cmd,args,{cwd:root,stdio:'inherit',...options});}
let backup=null,applied=[];
try{
 const branch=run('git',['branch','--show-current'],{encoding:'utf8',stdio:'pipe'}).trim();
 if(branch!==manifest.branch)throw Error('ต้องอยู่ branch '+manifest.branch+' (ตอนนี้ '+branch+')');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 if(![manifest.baseVersion,manifest.version].includes(pkg.version))throw Error('แพตช์นี้สำหรับฐาน '+manifest.baseVersion+' แต่พบ '+pkg.version);
 const files=manifest.files.map(item=>{
  if(path.isAbsolute(item.path)||item.path.split(/[\\/]/).includes('..'))throw Error('เส้นทางไฟล์ไม่ถูกต้อง');
  const source=path.join(__dirname,'files',item.path),target=path.join(root,item.path),data=fs.readFileSync(source);
  if(hash(data)!==item.sha256)throw Error('ไฟล์แพตช์ไม่สมบูรณ์: '+item.path);
  const exists=fs.existsSync(target),current=exists?fs.readFileSync(target):null,digest=current?hash(current):null;
  if(digest!==item.baseSha256&&digest!==item.sha256)throw Error('ไฟล์ฐานเปลี่ยนไป กรุณาส่งข้อความนี้ให้มีนาก่อน: '+item.path);
  return {...item,source,target,data,current};
 });
 if(process.argv.includes('--check')){console.log('PREFLIGHT PASS: branch, base files and patch hashes');process.exit(0);}
 backup=path.join(root,'.patch-backups','v1.18.0-'+Date.now());fs.mkdirSync(backup,{recursive:true});
 for(const file of files){
  if(file.current!==null){const dest=path.join(backup,file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.current);}
 }
 fs.writeFileSync(path.join(backup,'restore.json'),JSON.stringify(files.map(f=>({path:f.path,existed:f.current!==null})),null,2)+'\n');
 for(const file of files){fs.mkdirSync(path.dirname(file.target),{recursive:true});fs.writeFileSync(file.target,file.data);applied.push(file);}
 if(!fs.existsSync(path.join(root,'node_modules')))run('npm',['ci']);
 run(process.execPath,['--check','server.js']);run(process.execPath,['--check','public/app.js']);run('npm',['test']);
 run('git',['diff','--check','--',...files.map(x=>x.path)]);
 console.log('\nPATCH PASS: บ้านผีสิง v1.18.0 พร้อมอาร์ท 9 ใบ');
 console.log('สำรองไว้ที่ '+path.relative(root,backup));
 console.log('ยังไม่ commit / push / deploy — ตรวจ diff แล้ว commit ตามขั้นตอนเดิมได้');
 console.log('เตรียมเฉพาะไฟล์แพตช์สำหรับ commit: node Baan-Phi-Sing-v1.18.0-patch/stage.cjs');
}catch(error){
 for(const file of applied.reverse()){if(file.current===null)fs.rmSync(file.target,{force:true});else fs.writeFileSync(file.target,file.current);}
 console.error('\nPATCH STOP: '+error.message);
 if(applied.length)console.error('คืนไฟล์เดิมแล้ว สำรองอยู่ที่ '+backup);
 process.exitCode=1;
}
