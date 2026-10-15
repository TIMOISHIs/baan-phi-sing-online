const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root=process.cwd(),patch=__dirname,manifest=require('./manifest.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()}
function run(command,args){const r=cp.spawnSync(command,args,{cwd:root,stdio:'inherit'});if(r.error||r.status!==0)throw Error(command+' '+args.join(' ')+' failed')}
try{
 if(git(['branch','--show-current'])!==manifest.branch)throw Error('กรุณาใช้ branch '+manifest.branch);
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
 if(![manifest.baseVersion,manifest.version].includes(version))throw Error('รองรับเฉพาะ v'+manifest.baseVersion+' / v'+manifest.version+' (พบ '+version+')');
 const conflicts=[];
 for(const item of manifest.files){
  const src=path.join(patch,'files',item.path),dest=path.join(root,item.path);
  if(hash(fs.readFileSync(src))!==item.sha256)throw Error('ไฟล์แพตช์เสียหาย: '+item.path);
  const actual=fs.existsSync(dest)?hash(fs.readFileSync(dest)):null;
  if(actual!==item.baseSha256&&actual!==item.sha256)conflicts.push(item.path);
 }
 if(conflicts.length)throw Error('ไฟล์ปัจจุบันต่างจากฐานที่ตรวจไว้ ยังไม่ได้เขียนทับ:\n'+conflicts.join('\n'));
 if(process.argv.includes('--check')){console.log('PRECHECK PASS');process.exit(0)}
 const backup=path.join(root,'.patch-backups','v'+manifest.version+'-'+Date.now());
 fs.mkdirSync(backup,{recursive:true});
 const restore=[];
 for(const item of manifest.files){
  const dest=path.join(root,item.path),existed=fs.existsSync(dest);restore.push({path:item.path,existed});
  if(existed){const copy=path.join(backup,item.path);fs.mkdirSync(path.dirname(copy),{recursive:true});fs.copyFileSync(dest,copy)}
 }
 fs.writeFileSync(path.join(backup,'restore.json'),JSON.stringify(restore,null,2));
 try{
  for(const item of manifest.files){const dest=path.join(root,item.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(patch,'files',item.path),dest)}
  if(!fs.existsSync(path.join(root,'node_modules','jsdom')))run('npm',['ci']);
  run(process.execPath,['--check','public/ui1182.js']);run(process.execPath,['--check','server.js']);run(process.execPath,['--check','public/app.js']);
  run('npm',['test']);run('git',['diff','--check','--',...manifest.files.map(x=>x.path)]);
  console.log('\nPATCH v'+manifest.version+' PASS\nBackup: '+backup+'\nพร้อม stage / commit');
 }catch(error){
  for(const item of restore){const dest=path.join(root,item.path);if(item.existed)fs.copyFileSync(path.join(backup,item.path),dest);else fs.rmSync(dest,{force:true})}
  throw Error('ตรวจไม่ผ่าน คืนไฟล์เดิมแล้ว: '+error.message);
 }
}catch(error){console.error('\nSTOP: '+error.message);process.exitCode=1}
