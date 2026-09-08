import {test,expect,chromium,Page,Browser,BrowserContext} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let page:Page, browser:Browser, context:BrowserContext;
test.beforeAll(async()=>{
 browser=process.env.BROWSE_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSE_CDP_URL)
  : await chromium.launch();
 context=await browser.newContext();
 page=await context.newPage();
});
test.afterAll(async()=>{await context?.close();if(!process.env.BROWSE_CDP_URL)await browser?.close();});
test.beforeEach(async()=>{await page.setViewportSize({width:1440,height:1000});await page.goto(pathToFileURL(resolve(process.env.VIEWER_HTML_PATH||'dist/Markdown Viewer.html')).href);await page.evaluate(()=>localStorage.clear());await page.reload();});
test('opens local Markdown, toggles source, handles wide tables, and preserves original text',async()=>{
 const text='# Report\n\n## Decisions\n\n|A|B|C|D|E|F|\n|---|---|---|---|---|---|\n|one|two|three|four|five|six|';
 await page.locator('#file-input').setInputFiles({name:'Report.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
 await expect(page.locator('#preview h1')).toHaveText('Report');await page.locator('#source-toggle').click();await expect(page.locator('#source')).toHaveValue(text);await page.locator('#read').click();await page.locator('#wide').click();await expect(page.locator('body')).toHaveClass(/wide/);
 expect(await page.locator('.table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
 await page.locator('#file-input').setInputFiles({name:'binary.md',mimeType:'text/markdown',buffer:Buffer.from('a\0b')});await expect(page.locator('#notice')).toContainText('binary');await expect(page.locator('#preview h1')).toHaveText('Report');
});
test('paste is offline and cannot execute document scripts or load remote assets',async()=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().startsWith('http'))requests.push(r.url());});
 await page.locator('[data-paste]').first().click();await page.locator('#paste-text').fill('# Safe\n\n<img src="https://example.com/tracker" onerror="window.compromised=true"><script>window.compromised=true</script>');await page.getByRole('button',{name:'Open document',exact:true}).click();await expect(page.locator('#image-note')).toBeVisible();await page.waitForTimeout(100);expect(requests).toEqual([]);expect(await page.evaluate(()=>Reflect.get(window,'compromised'))).toBeUndefined();
});
test('desktop and mobile reading surfaces pass accessibility and fit the viewport',async()=>{
 await page.screenshot({path:'test-results/empty-desktop.png'});await page.locator('#example').click();await page.screenshot({path:'test-results/reader-desktop.png'});
 const desktop=await new AxeBuilder({page}).analyze();expect(desktop.violations).toEqual([]);
 await page.locator('#theme').click();await page.screenshot({path:'test-results/reader-dark.png'});expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.locator('#theme').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/reader-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.locator('#menu').click();await page.locator('#outline a').nth(1).click();await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
});
test('drop, file switching, replacement, empty files, closing and printing work',async()=>{
 await page.evaluate(()=>{const data=new DataTransfer();data.items.add(new File(['# Dropped'],'Drop.md',{type:'text/markdown'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});
 await expect(page.locator('#preview h1')).toHaveText('Dropped');
 await page.locator('#file-input').setInputFiles([{name:'Empty.md',mimeType:'text/markdown',buffer:Buffer.from('')},{name:'Other.md',mimeType:'text/markdown',buffer:Buffer.from('# Other')}]);
 await expect(page.locator('#files .file-row')).toHaveCount(3);await page.getByRole('button',{name:'Empty.md',exact:true}).click();await expect(page.locator('#preview')).toHaveText('This file is empty.');
 await page.locator('#file-input').setInputFiles({name:'Other.md',mimeType:'text/markdown',buffer:Buffer.from('# Updated')});await expect(page.locator('#files .file-row')).toHaveCount(3);await expect(page.locator('#preview h1')).toHaveText('Updated');
 await page.evaluate(()=>{window.print=()=>Reflect.set(window,'printed',true);});await page.locator('#print').click();expect(await page.evaluate(()=>Reflect.get(window,'printed'))).toBe(true);
 while(await page.locator('.close-file').count())await page.locator('.close-file').first().click();await expect(page.locator('#empty')).toBeVisible();await expect(page.locator('#print')).toBeDisabled();
});
test('file drag shows feedback, survives nested elements, and clears after cancel or drop',async()=>{
 const data=await page.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['# From disk'],'Dragged.md',{type:'text/markdown'}));return d;});
 await page.locator('#empty').dispatchEvent('dragenter',{dataTransfer:data});await expect(page.locator('#drop-overlay')).toBeVisible();
 await page.locator('.paper-icon').dispatchEvent('dragenter',{dataTransfer:data});await page.locator('.paper-icon').dispatchEvent('dragleave',{dataTransfer:data});await expect(page.locator('#drop-overlay')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('#drop-overlay')).toBeHidden();
 await page.locator('#empty').dispatchEvent('dragover',{dataTransfer:data});await expect(page.locator('#drop-overlay')).toBeVisible();
 await page.locator('#empty').dispatchEvent('drop',{dataTransfer:data});await expect(page.locator('#preview h1')).toHaveText('From disk');await expect(page.locator('#drop-overlay')).toBeHidden();await expect(page.locator('#filename')).toHaveText('Dragged.md');
});

test('packaged HTML starts without errors and includes readable third-party notices',async()=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.reload();await page.locator('#example').click();
 await expect(page.locator('#preview h1')).toHaveText('A clearer view');
 expect(await page.locator('#third-party-notices').textContent()).toContain('dompurify@');
 expect(errors).toEqual([]);
});

test('local folder images, embedded images and Mermaid render offline with original source intact',async()=>{
 const {mkdtemp,writeFile,mkdir,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const folder=await mkdtemp(resolve(tmpdir(),'viewer-media-'));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDe8AAAAASUVORK5CYII=','base64');
 const text='# Media report\n\n![Local chart](../images/chart.png)\n\n![Embedded chart](data:image/png;base64,'+png.toString('base64')+')\n\n```mermaid\nflowchart LR\n A[Open] --> B[Read]\n```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: Report\n```';
 const requests:string[]=[];const onRequest=(r:any)=>{if(/^https?:/.test(r.url()))requests.push(r.url());};page.on('request',onRequest);
 try{
  await mkdir(resolve(folder,'reports'));await mkdir(resolve(folder,'images'));
  await writeFile(resolve(folder,'reports/report.md'),text);await writeFile(resolve(folder,'images/chart.png'),await (await import('node:fs/promises')).readFile(resolve('assets/readme/reader.png')));
  await context.setOffline(true);await page.locator('#folder-input').setInputFiles(folder);
  await expect(page.locator('#preview')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#preview img.document-image')).toHaveCount(2);
  await expect(page.locator('.diagram-light')).toHaveCount(2);await expect(page.locator('.diagram-dark')).toHaveCount(2);
  expect(await page.locator('.diagram-light').first().evaluate((el:HTMLImageElement)=>el.naturalWidth>0)).toBe(true);
  await page.locator('#source-toggle').click();await expect(page.locator('#source')).toHaveValue(text);await page.locator('#read').click();
  await page.locator('#theme').click();await expect(page.locator('.diagram-dark').first()).toBeVisible();await expect(page.locator('.diagram-light').first()).toBeHidden();
  await page.emulateMedia({media:'print'});await expect(page.locator('.diagram-light').first()).toBeVisible();await expect(page.locator('.diagram-dark').first()).toBeHidden();
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.pdf({path:'test-results/media-print.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  await page.screenshot({path:'test-results/media-dark.png'});
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.locator('#theme').click();await page.screenshot({path:'test-results/media-light.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/media-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(requests).toEqual([]);
 }finally{await context.setOffline(false);page.off('request',onRequest);await rm(folder,{recursive:true,force:true});}
});

test('attached images stay with their document and invalid image bytes remain inert',async()=>{
 await page.evaluate(()=>{const live=new Set<string>();Reflect.set(window,'liveURLs',live);const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);live.add(url);return url;};URL.revokeObjectURL=url=>{live.delete(url);revoke(url);};});
 const text='# Attachments\n\n![Chart](images/chart.png)';
 await page.locator('#file-input').setInputFiles({name:'Attachments.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
 await expect(page.locator('#image-status')).toContainText('unavailable');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d')!;x.fillStyle='#235da6';x.fillRect(0,0,120,80);return c.toDataURL().split(',')[1];});
 const choose=page.waitForEvent('filechooser');await page.locator('#add-images').click();
 await (await choose).setFiles({name:'chart.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('.document-image')).toHaveJSProperty('naturalWidth',120);await expect(page.locator('#image-note')).toBeHidden();
 await page.locator('#file-input').setInputFiles({name:'Other.md',mimeType:'text/markdown',buffer:Buffer.from('# Other\n\n![Chart](images/chart.png)')});
 await expect(page.locator('.document-image')).toHaveCount(0);await expect(page.locator('#image-status')).toContainText('unavailable');
 await page.getByRole('button',{name:'Attachments.md',exact:true}).click();await expect(page.locator('.document-image')).toHaveJSProperty('naturalWidth',120);
 const malformed=page.waitForEvent('filechooser');await page.evaluate(()=>document.getElementById('add-images')!.click());
 await (await malformed).setFiles({name:'chart.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="window.compromised=true"></svg>')});
 await expect(page.locator('.image-placeholder')).toContainText('Use a PNG, JPEG, WebP, or GIF');expect(await page.evaluate(()=>Reflect.get(window,'compromised'))).toBeUndefined();
 await page.locator('#source-toggle').click();await expect(page.locator('#source')).toHaveValue(text);
 while(await page.locator('.close-file').count())await page.locator('.close-file').first().click();
 expect(await page.evaluate(()=>Reflect.get(window,'liveURLs').size)).toBe(0);
});

test('a selected document folder resolves images without importing its other documents',async()=>{
 const {mkdtemp,writeFile,mkdir,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const folder=await mkdtemp(resolve(tmpdir(),'viewer-image-folder-'));
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=75;c.height=50;return c.toDataURL().split(',')[1];});
 try{
  await mkdir(resolve(folder,'images'));await writeFile(resolve(folder,'images/chart.png'),Buffer.from(png,'base64'));await writeFile(resolve(folder,'unrelated.md'),'# Unrelated');
  await page.locator('#file-input').setInputFiles({name:'Selected.md',mimeType:'text/markdown',buffer:Buffer.from('# Selected\n\n![Chart](images/chart.png)')});
  const choose=page.waitForEvent('filechooser');await page.locator('#add-image-folder').click();await (await choose).setFiles(folder);
  await expect(page.locator('.document-image')).toHaveJSProperty('naturalWidth',75);await expect(page.locator('#files .file-row')).toHaveCount(1);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('remote media, SVG images, diagram settings and resource URLs never make requests',async()=>{
 const requests:string[]=[];const listener=(r:any)=>{if(/^https?:/.test(r.url()))requests.push(r.url());};page.on('request',listener);
 const diagrams=[
  '%%{init: {"securityLevel":"loose","themeCSS":"@import url(https://example.com/style)"}}%%\nflowchart LR\n A-->B',
  'flowchart LR\n A@{img: "https://example.com/pixel", label: "Remote"}',
  'flowchart LR\n A["<img src=https://example.com/pixel onerror=window.compromised=true>"]',
  'flowchart LR\n A-->B\n classDef bad fill:url(https://example.com/a);',
  '---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\n A-->B',
  'this is not a diagram',
  'flowchart LR\n A['+'x'.repeat(8100)+']',
 ];
 const text='# Restricted media\n\n![Remote](https://example.com/pixel)\n\n![SVG](data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.compromised=true"/>').toString('base64')+')\n\n'+diagrams.map(d=>'```mermaid\n'+d+'\n```').join('\n\n');
 try{
  await page.locator('#file-input').setInputFiles({name:'Restricted.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
  await expect(page.locator('#preview')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#preview img')).toHaveCount(0);await expect(page.locator('.diagram details[open]')).toHaveCount(diagrams.length);
  await expect(page.locator('.diagram-stage')).toHaveCount(0);await expect(page.locator('body > svg')).toHaveCount(0);
  expect(await page.evaluate(()=>Reflect.get(window,'compromised'))).toBeUndefined();expect(requests).toEqual([]);
 }finally{page.off('request',listener);}
});

test('image dimensions are bounded before decode and rapid switching leaves no stale diagrams',async()=>{
 const png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);png.set([73,72,68,82],12);png.writeUInt32BE(100000,16);png.writeUInt32BE(100000,20);
 await page.locator('#file-input').setInputFiles({name:'Huge.md',mimeType:'text/markdown',buffer:Buffer.from('# Huge\n\n![Huge](data:image/png;base64,'+png.toString('base64')+')')});
 await expect(page.locator('.image-placeholder')).toContainText('dimensions exceed');await expect(page.locator('.document-image')).toHaveCount(0);
 await page.locator('#file-input').setInputFiles({name:'Stable.md',mimeType:'text/markdown',buffer:Buffer.from('# Stable')});
 await page.evaluate(()=>{
  const data=new DataTransfer();data.items.add(new File(['# Slow\n\n'+Array.from({length:10},()=> '```mermaid\nflowchart LR\n A-->B\n```').join('\n')],'Slow.md'));
  const input=document.querySelector<HTMLInputElement>('#file-input')!;input.files=data.files;input.dispatchEvent(new Event('change'));
 });
 await expect(page.locator('#filename')).toHaveText('Slow.md');await page.getByRole('button',{name:'Stable.md',exact:true}).click();
 await expect(page.locator('#preview')).toHaveAttribute('aria-busy','false');await expect(page.locator('#preview h1')).toHaveText('Stable');await expect(page.locator('.diagram')).toHaveCount(0);await expect(page.locator('.diagram-stage')).toHaveCount(0);
});

test('full Mermaid types render locally and the document diagram count stays bounded',async()=>{
 const definitions=[
 'flowchart LR\n A[Open]-->B[Read]',
 'sequenceDiagram\n Alice->>Bob: Report',
 'erDiagram\n TEAM ||--o{ DOCUMENT : owns',
 'mindmap\n root((Report))\n  Notes\n  Decisions',
 'architecture-beta\n service db(database)[Database]\n service api(server)[API]\n api:R -- L:db',
 ];
 await context.setOffline(true);
 try{
  const text='# Diagram types\n\n'+[...definitions,...definitions,definitions[0]].map(d=>'```mermaid\n'+d+'\n```').join('\n\n');
  await page.locator('#file-input').setInputFiles({name:'Diagrams.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
  await expect(page.locator('#preview')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.diagram-light')).toHaveCount(10);await expect(page.locator('.diagram-dark')).toHaveCount(10);
  await expect(page.locator('.diagram').last()).toContainText('Only the first 10');
  await expect(page.locator('.diagram-stage')).toHaveCount(0);
  for(let i=0;i<5;i++)await page.locator('.diagram').nth(i).screenshot({path:`test-results/diagram-type-${i}.png`});
 }finally{await context.setOffline(false);}
});

test('JPEG, WebP and GIF files decode as images and corrupt files report a readable error',async()=>{
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=24;c.height=16;return {jpeg:c.toDataURL('image/jpeg').split(',')[1],webp:c.toDataURL('image/webp').split(',')[1]};});
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
 const text='# Formats\n\n![JPEG](photo.jpg)\n\n![WebP](photo.webp)\n\n![GIF](photo.gif)';
 await page.locator('#file-input').setInputFiles([
 {name:'Formats.md',mimeType:'text/markdown',buffer:Buffer.from(text)},
 {name:'photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data.jpeg,'base64')},
 {name:'photo.webp',mimeType:'image/webp',buffer:Buffer.from(data.webp,'base64')},
 {name:'photo.gif',mimeType:'image/gif',buffer:gif},
 ]);
 await expect(page.locator('#preview')).toHaveAttribute('aria-busy','false');await expect(page.locator('.document-image')).toHaveCount(3);
 expect(await page.locator('.document-image').evaluateAll(elements=>elements.map(el=>(el as HTMLImageElement).naturalWidth))).toEqual([24,24,1]);
});
