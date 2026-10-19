import fs from 'node:fs';import{prepareObserver}from'./observer.mjs';
const release=JSON.parse(fs.readFileSync('export/release.json','utf8'));
const body=fs.readFileSync("export/assets/index-DAGFhrVR.js");
fs.mkdirSync('preflight',{recursive:true});const base='http://127.0.0.1:19413/',prepared=prepareObserver(body,release,base,new URL("assets/index-DAGFhrVR.js",base).href);fs.writeFileSync('preflight/observed173.mjs',prepared.observed);fs.writeFileSync('preflight/observer.json',JSON.stringify(prepared.probe,null,2)+'\n');
