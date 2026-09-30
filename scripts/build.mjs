import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(await readFile(path.join(root,'research-data.json'),'utf8'));
const serialized=JSON.stringify(data);
await rm(path.join(root,'public'),{recursive:true,force:true});
await mkdir(path.join(root,'public'),{recursive:true});
await mkdir(path.join(root,'server'),{recursive:true});
await writeFile(path.join(root,'data.js'),'window.RESEARCH_DATA = '+serialized+';\n');
await writeFile(path.join(root,'server/seed.mjs'),'export const seed = '+serialized+';\n');
for(const name of ['index.html','app.js','data.js','styles.css','research-data.json','README.md','核查记录.md','AI使用与验证记录.md','测试说明.md','test-results-v2.json']){
 try{await copyFile(path.join(root,name),path.join(root,'public',name));}catch(e){if(e.code!=='ENOENT')throw e;}
}
console.log(`Built ${data.companies.length} research samples; copied public files only.`);
