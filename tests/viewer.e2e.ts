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
 expect(await page.locator('#third-party-notices').textContent()).toContain('DOMPurify');
 expect(errors).toEqual([]);
});
