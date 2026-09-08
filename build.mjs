import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const result=await build({entryPoints:['src/app.ts'],bundle:true,minify:true,write:false,format:'iife',target:['safari15','chrome100'],legalComments:'inline'});
const html=(await readFile('src/index.html','utf8')).replace('/*CSS*/',await readFile('src/style.css','utf8')).replace('/*JS*/',()=>result.outputFiles[0].text.replaceAll('</script','<\\/script'));
const notices='\n<script type="text/plain" id="third-party-notices">'+((await readFile('LICENSE','utf8'))+'\n\n'+(await readFile('THIRD_PARTY_NOTICES.txt','utf8'))).replaceAll('</script','<\\/script')+'</script>';
const closingBody=html.lastIndexOf('</body>');
const output=html.slice(0,closingBody)+notices+html.slice(closingBody);
await mkdir('dist',{recursive:true});await writeFile('dist/Markdown Viewer.html',output);console.log(`Built offline viewer (${Buffer.byteLength(output)} bytes)`);
