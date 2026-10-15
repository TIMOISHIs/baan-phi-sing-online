'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),m=require('./manifest.json');
try{
 const branch=cp.execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();if(branch!==m.branch)throw Error('ต้องอยู่ branch '+m.branch);
 for(const item of m.files){const data=fs.readFileSync(path.join(process.cwd(),item.path));if(crypto.createHash('sha256').update(data).digest('hex')!==item.sha256)throw Error('ไฟล์เปลี่ยนจากแพตช์: '+item.path);}
 cp.execFileSync('git',['add','--',...m.files.map(x=>x.path)],{stdio:'inherit'});
 console.log('เตรียมไฟล์แพตช์สำหรับ commit แล้ว — ยังไม่ commit หรือ push');
}catch(e){console.error(e.message);process.exitCode=1;}
