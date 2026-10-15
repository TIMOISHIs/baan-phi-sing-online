const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const manifest=require('./manifest.json'),root=process.cwd();
try{
 const branch=cp.execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
 if(branch!==manifest.branch)throw Error('ใช้ branch '+manifest.branch+' เท่านั้น');
 for(const item of manifest.files){const bytes=fs.readFileSync(path.join(root,item.path));if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('ไฟล์ยังไม่ตรงแพตช์: '+item.path)}
 cp.execFileSync('git',['add','--',...manifest.files.map(x=>x.path)],{stdio:'inherit'});
 console.log('STAGE PASS: '+manifest.files.length+' files พร้อม commit');
}catch(error){console.error('STOP: '+error.message);process.exitCode=1}
