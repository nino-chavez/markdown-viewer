import { renderMarkdown, validateFile, MAX_BYTES } from './render';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
interface OpenDocument {name:string;text:string;modified:number}
const documents:OpenDocument[]=[];let active=-1;let sourceMode=false;let loadSequence=0;
const preview=$('preview'), source=$<HTMLTextAreaElement>('source'), input=$<HTMLInputElement>('file-input');
const SAMPLE='# A clearer view\n\nMarkdown is plain text with a little structure. This reader turns it into a document.\n\n## Make yourself at home\n\nOpen a file, drop one anywhere, or paste some text. Your files stay on this device and are never uploaded.\n\n- **Read** the formatted document.\n- **Source** shows the original Markdown.\n- **Wide** gives reports and tables more room.\n\n## A table worth reading\n\n| Feature | What it does |\n| --- | --- |\n| Outline | Jump straight to a section |\n| Multiple files | Switch between documents in this session |\n| Print | Print the document or save it as a PDF |\n\n> The document is the point. Everything else stays out of the way.\n\n## A little code\n\n```js\nconst message = "Hello, Markdown.";\nconsole.log(message);\n```\n\n## A short checklist\n\n- [x] Open a document\n- [ ] Bring a file of your own\n\n---\n\nImages and embedded content are omitted so a document cannot make network requests. Your original file stays unchanged.';
function notify(message:string,error=false){const box=$('notice');box.textContent=message;box.classList.toggle('error',error);box.hidden=!message;}
function pref(key:string,value?:string){try{if(value!==undefined)localStorage.setItem('md-reader-'+key,value);return localStorage.getItem('md-reader-'+key);}catch{return null;}}
function setTheme(dark:boolean){document.documentElement.dataset.theme=dark?'dark':'light';$('theme').setAttribute('aria-pressed',String(dark));$('theme').textContent=dark?'Light':'Dark';pref('theme',dark?'dark':'light');}
function setWide(wide:boolean){document.body.classList.toggle('wide',wide);$('wide').setAttribute('aria-pressed',String(wide));pref('wide',String(wide));}
setTheme(pref('theme')==='dark');setWide(pref('wide')==='true');
function activate(index:number){
 active=index;const doc=documents[index];document.body.classList.add('has-document');notify('');
 $('empty').hidden=true;$('document').hidden=false;$('filename').textContent=doc.name;document.title=`${doc.name} · Markdown Viewer`;
 const words=doc.text.trim()?doc.text.trim().split(/\s+/u).length:0;$('metadata').textContent=`${words.toLocaleString()} words · ${Math.max(1,Math.ceil(words/220))} min read`;
 source.value=doc.text;const rendered=renderMarkdown(doc.text);preview.replaceChildren(rendered.fragment);
 if(!doc.text.trim()){const p=document.createElement('p');p.className='empty-document';p.textContent='This file is empty.';preview.append(p);}
 $('image-note').hidden=!rendered.images;$('image-note').textContent=rendered.images?`${rendered.images} image${rendered.images===1?'':'s'} omitted. This viewer keeps documents offline.`:'';
 const outline=$('outline');outline.replaceChildren();
 for(const heading of rendered.headings){const a=document.createElement('a');a.href='#'+heading.id;a.textContent=heading.text;a.style.paddingLeft=`${12+Math.min(heading.level-1,3)*12}px`;a.onclick=e=>{e.preventDefault();setMode(false);document.getElementById(heading.id)?.scrollIntoView({block:'start'});document.body.classList.remove('sidebar-open');$('menu').setAttribute('aria-expanded','false');};outline.append(a);}
 if(!rendered.headings.length){const p=document.createElement('p');p.className='aside-hint';p.textContent='No headings in this document.';outline.append(p);}
 renderFileList();setMode(sourceMode);$('scroll-area').scrollTop=0;updateButtons();
}
function renderFileList(){const list=$('files');list.replaceChildren();documents.forEach((doc,i)=>{const row=document.createElement('div');row.className='file-row';const b=document.createElement('button');b.textContent=doc.name;b.title=doc.name;b.setAttribute('aria-current',String(i===active));b.onclick=()=>activate(i);const close=document.createElement('button');close.textContent='×';close.className='close-file';close.setAttribute('aria-label',`Close ${doc.name}`);close.onclick=()=>{documents.splice(i,1);if(documents.length)activate(i===active?Math.min(i,documents.length-1):active-(i<active?1:0));else reset();};row.append(b,close);list.append(row);});}
function reset(){active=-1;preview.replaceChildren();source.value='';$('document').hidden=true;$('empty').hidden=false;$('outline').replaceChildren();$('files').replaceChildren();$('metadata').textContent='A local Markdown reader';$('filename').textContent='No document open';document.title='Markdown Viewer';document.body.classList.remove('has-document');updateButtons();}
function updateButtons(){for(const id of ['read','source-toggle','copy','print','wide'])($<HTMLButtonElement>(id)).disabled=active<0;}
function setMode(raw:boolean){sourceMode=raw;source.hidden=!raw;preview.hidden=raw;$('read').setAttribute('aria-pressed',String(!raw));$('source-toggle').setAttribute('aria-pressed',String(raw));$('outline').inert=raw;}
function addDocument(doc:OpenDocument){const existing=documents.findIndex(d=>d.name===doc.name);if(existing>=0){documents[existing]=doc;activate(existing);}else{documents.push(doc);activate(documents.length-1);}}
async function openFiles(files:File[]){const sequence=++loadSequence;let errors:string[]=[];notify('Opening…');for(const file of files){const err=validateFile(file.name,file.size);if(err){errors.push(`${file.name}: ${err}`);continue;}try{const text=await file.text();if(sequence!==loadSequence)return;if(text.includes('\0')){errors.push(`${file.name}: This appears to be a binary file.`);continue;}addDocument({name:file.name,text,modified:file.lastModified});}catch{errors.push(`${file.name}: Could not read this file. Try opening it again.`);}}if(sequence===loadSequence)notify(errors.join(' '),errors.length>0);input.value='';}
input.onchange=()=>{void openFiles(Array.from(input.files||[]));};document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>input.click()));
$('read').onclick=()=>setMode(false);$('source-toggle').onclick=()=>setMode(true);$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme!=='dark');$('wide').onclick=()=>setWide(!document.body.classList.contains('wide'));
$('menu').onclick=()=>{const open=document.body.classList.toggle('sidebar-open');$('menu').setAttribute('aria-expanded',String(open));};
$('example').onclick=()=>addDocument({name:'Welcome.md',text:SAMPLE,modified:0});
const dialog=$<HTMLDialogElement>('paste-dialog');let returnFocus:HTMLElement|null=null;
document.querySelectorAll('[data-paste]').forEach(b=>b.addEventListener('click',()=>{returnFocus=document.activeElement as HTMLElement;dialog.showModal();$('paste-text').focus();}));
$('cancel-paste').onclick=()=>dialog.close();dialog.addEventListener('close',()=>returnFocus?.focus());
$('paste-form').onsubmit=e=>{e.preventDefault();const text=$<HTMLTextAreaElement>('paste-text').value;if(new Blob([text]).size>MAX_BYTES){$('paste-error').textContent='Paste less than 2 MB of text.';return;}let name=$<HTMLInputElement>('paste-name').value.trim()||'Pasted document.md';if(!/\.md$/i.test(name))name+='.md';addDocument({name,text,modified:0});dialog.close();$('paste-error').textContent='';};
$('copy').onclick=async()=>{if(active<0)return;try{await navigator.clipboard.writeText(documents[active].text);notify('Markdown copied.');}catch{setMode(true);source.select();notify('Press Command+C to copy the selected source.');}};
$('print').onclick=()=>{setMode(false);window.print();};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='o'){e.preventDefault();input.click();}if(e.key==='Escape'){document.body.classList.remove('sidebar-open');$('menu').setAttribute('aria-expanded','false');}});
let dragDepth=0;
function clearDrop(){dragDepth=0;$('drop-overlay').hidden=true;}
function isFileDrag(e:DragEvent){return Array.from(e.dataTransfer?.types||[]).includes('Files');}
document.addEventListener('dragenter',e=>{if(isFileDrag(e)){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});
document.addEventListener('dragover',e=>{if(isFileDrag(e)){e.preventDefault();e.dataTransfer!.dropEffect='copy';$('drop-overlay').hidden=false;}});
document.addEventListener('dragleave',()=>{if(dragDepth>0&&--dragDepth===0)clearDrop();});
document.addEventListener('drop',e=>{if(!isFileDrag(e))return;e.preventDefault();clearDrop();if(e.dataTransfer?.files.length)void openFiles(Array.from(e.dataTransfer.files));});
document.addEventListener('dragend',clearDrop);
window.addEventListener('blur',clearDrop);
document.addEventListener('keydown',e=>{if(e.key==='Escape')clearDrop();});

preview.addEventListener('click',e=>{const target=(e.target as Element).closest('a');const href=target?.getAttribute('href');if(href?.startsWith('#')){e.preventDefault();try{document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({block:'start'});}catch{/* invalid anchor leaves document unchanged */}}});
updateButtons();
