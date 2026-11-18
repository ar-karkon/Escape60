import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const out=new URL('../dist/',import.meta.url);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await cp(new URL('../web/',import.meta.url),out,{recursive:true});
console.log('Built deployable static game in dist/');
