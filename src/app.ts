import { renderMarkdown, validateFile, MAX_BYTES } from './render';
import { loadImages, isRasterFile, localPath, MAX_ASSET_BYTES, type ImageFiles } from './images';
import { loadDiagrams } from './diagrams';
import { setupPWA } from './pwa';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
interface OpenDocument { name: string; text: string; assets: ImageFiles; base: string; loose: boolean }
const documents: OpenDocument[] = [];
const emptyAssets: ImageFiles = new Map();
let active = -1, sourceMode = false, loadSequence = 0, mediaSequence = 0;
let mediaReady: Promise<void> = Promise.resolve();
let mediaURLs: string[] = [];
let attachmentTarget: OpenDocument | undefined;
const preview = $('preview'), source = $<HTMLTextAreaElement>('source'), input = $<HTMLInputElement>('file-input');
const SAMPLE='# A clearer view\n\nMarkdown is plain text with a little structure. This reader turns it into a document.\n\n## Make yourself at home\n\nOpen a file, drop one anywhere, or paste some text. Your files stay on this device and are never uploaded.\n\n- **Read** the formatted document.\n- **Source** shows the original Markdown.\n- **Wide** gives reports and tables more room.\n\n## A table worth reading\n\n| Feature | What it does |\n| --- | --- |\n| Outline | Jump straight to a section |\n| Multiple files | Switch between documents in this session |\n| Print | Print the document or save it as a PDF |\n\n> The document is the point. Everything else stays out of the way.\n\n## A little code\n\n```js\nconst message = "Hello, Markdown.";\nconsole.log(message);\n```\n\n## A short checklist\n\n- [x] Open a document\n- [ ] Bring a file of your own\n\n---\n\nLocal images and Mermaid diagrams can be read offline. Remote images stay blocked. Your original file stays unchanged.';
function notify(message: string, error = false) {
  const box = $('notice'); box.textContent = message; box.classList.toggle('error', error); box.hidden = !message;
}
function pref(key: string, value?: string) {
  try { if (value !== undefined) localStorage.setItem('md-reader-' + key, value); return localStorage.getItem('md-reader-' + key); }
  catch { return null; }
}
function setTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme').setAttribute('aria-pressed', String(dark)); $('theme').textContent = dark ? 'Light' : 'Dark'; pref('theme', dark ? 'dark' : 'light');
}
function setWide(wide: boolean) { document.body.classList.toggle('wide', wide); $('wide').setAttribute('aria-pressed', String(wide)); pref('wide', String(wide)); }
setTheme(pref('theme') === 'dark'); setWide(pref('wide') === 'true');

function clearMedia() {
  mediaSequence++;
  for (const url of mediaURLs) URL.revokeObjectURL(url);
  mediaURLs = [];
}
function activate(index: number, preserveScroll = false) {
  const scroll = $('scroll-area').scrollTop;
  clearMedia(); active = index;
  const doc = documents[index], sequence = mediaSequence;
  const current = () => mediaSequence === sequence && documents[active] === doc;
  const ownURL = (url: string) => { if (current()) mediaURLs.push(url); else URL.revokeObjectURL(url); };
  document.body.classList.add('has-document'); notify('');
  $('empty').hidden = true; $('document').hidden = false; $('filename').textContent = doc.name;
  document.title = `${doc.name} · Markdown Viewer`;
  const words = doc.text.trim() ? doc.text.trim().split(/\s+/u).length : 0;
  $('metadata').textContent = `${words.toLocaleString()} words · ${Math.max(1, Math.ceil(words / 220))} min read`;
  source.value = doc.text;
  const rendered = renderMarkdown(doc.text); preview.replaceChildren(rendered.fragment);
  if (!doc.text.trim()) { const p = document.createElement('p'); p.className = 'empty-document'; p.textContent = 'This file is empty.'; preview.append(p); }
  $('image-note').hidden = !rendered.images;
  const hasLocalImages = rendered.imageReferences.some(ref => localPath(ref.src, doc.base) !== null);
  $('image-note').querySelector<HTMLElement>('.image-actions')!.hidden = !hasLocalImages;
  $('image-note').querySelector<HTMLElement>('.image-help')!.hidden = !hasLocalImages;
  $('image-status').textContent = 'Loading local images. Remote images stay blocked.';
  const imageTask = loadImages(rendered.imageReferences, doc.assets, doc.base, doc.loose, current, ownURL).then(({ missing, blocked }) => {
    if (!current()) return;
    const unavailable = missing + blocked;
    $('image-note').hidden = unavailable === 0;
    $('image-status').textContent = unavailable ? `${unavailable} image${unavailable === 1 ? '' : 's'} unavailable. ${missing ? 'Add missing local images below. ' : ''}Remote images stay blocked.` : 'Local images loaded. Remote images stay blocked.';
  });
  preview.setAttribute('aria-busy', 'true');
  mediaReady = Promise.all([imageTask, loadDiagrams(preview, current, ownURL)]).then(() => {
    if (current()) preview.setAttribute('aria-busy', 'false');
  }).catch(() => {
    if (current()) { preview.setAttribute('aria-busy', 'false'); notify('Some media could not be displayed. The document text is still available.', true); }
  });
  const outline = $('outline'); outline.replaceChildren();
  for (const heading of rendered.headings) {
    const a = document.createElement('a'); a.href = '#' + heading.id; a.textContent = heading.text;
    a.style.paddingLeft = `${12 + Math.min(heading.level - 1, 3) * 12}px`;
    a.onclick = e => { e.preventDefault(); setMode(false); document.getElementById(heading.id)?.scrollIntoView({ block: 'start' }); closeSidebar(); };
    outline.append(a);
  }
  if (!rendered.headings.length) { const p = document.createElement('p'); p.className = 'aside-hint'; p.textContent = 'No headings in this document.'; outline.append(p); }
  renderFileList(); setMode(sourceMode); $('scroll-area').scrollTop = preserveScroll ? scroll : 0; updateButtons();
}
function closeSidebar() { document.body.classList.remove('sidebar-open'); $('menu').setAttribute('aria-expanded', 'false'); }
function renderFileList() {
  const list = $('files'); list.replaceChildren();
  documents.forEach((doc, i) => {
    const row = document.createElement('div'); row.className = 'file-row';
    const b = document.createElement('button'); b.textContent = doc.name; b.title = doc.name;
    b.setAttribute('aria-current', String(i === active)); b.onclick = () => activate(i);
    const close = document.createElement('button'); close.textContent = '×'; close.className = 'close-file'; close.setAttribute('aria-label', `Close ${doc.name}`);
    close.onclick = () => {
      documents.splice(i, 1);
      if (documents.length) activate(i === active ? Math.min(i, documents.length - 1) : active - (i < active ? 1 : 0)); else reset();
    };
    row.append(b, close); list.append(row);
  });
}
function reset() {
  clearMedia(); active = -1; preview.replaceChildren(); source.value = ''; $('document').hidden = true; $('empty').hidden = false;
  $('outline').replaceChildren(); $('files').replaceChildren(); $('metadata').textContent = 'A local Markdown reader'; $('filename').textContent = 'No document open';
  document.title = 'Markdown Viewer'; document.body.classList.remove('has-document'); updateButtons();
}
function updateButtons() { for (const id of ['read', 'source-toggle', 'copy', 'print', 'wide', 'add-images', 'add-image-folder']) $<HTMLButtonElement>(id).disabled = active < 0; }
function setMode(raw: boolean) { sourceMode = raw; source.hidden = !raw; preview.hidden = raw; $('read').setAttribute('aria-pressed', String(!raw)); $('source-toggle').setAttribute('aria-pressed', String(raw)); $('outline').inert = raw; }
function addDocument(doc: OpenDocument) {
  const existing = documents.findIndex(d => d.name === doc.name);
  if (existing >= 0) { documents[existing] = doc; activate(existing); }
  else if (documents.length < 30) { documents.push(doc); activate(documents.length - 1); }
  else throw new Error('Close a document before opening more. Up to 30 documents can stay open.');
}
function selectedAssets(files: File[], folder: boolean): ImageFiles {
  const map = new Map<string, File>();
  if (files.length > 1000) throw new Error('Choose a smaller folder or selection, with up to 1,000 files.');
  for (const file of files) {
    if (!isRasterFile(file)) continue;
    const path = folder ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
    if (path && !path.split('/').some(part => part === '.' || part === '..')) {
      if (map.has(path)) throw new Error(`Two selected images have the same name: ${path}. Choose their folder to preserve paths.`);
      map.set(path, file);
    }
  }
  return map;
}
function checkAssetBudget(assets: ImageFiles, replacing: OpenDocument[] = []) {
  const files = new Set(assets.values());
  for (const doc of documents) if (!replacing.includes(doc)) for (const file of doc.assets.values()) files.add(file);
  if ([...files].reduce((sum, file) => sum + file.size, 0) > MAX_ASSET_BYTES) throw new Error('Selected images exceed the 64 MB session limit. Close documents or select fewer images.');
}
async function openFiles(files: File[], folder = false) {
  const sequence = ++loadSequence; const errors: string[] = []; notify('Opening…');
  try {
    const assets = selectedAssets(files, folder);
    const docs = files.filter(file => !isRasterFile(file) && (!folder || validateFile(file.name, 0) === null));
    const replacing = documents.filter(doc => docs.some(file => doc.name === (folder ? file.webkitRelativePath : file.name)));
    if (!docs.length) {
      if (active >= 0 && assets.size) { attachAssets(assets, false, documents[active]); return; }
      notify(folder ? 'No Markdown documents found in this folder.' : 'Open a Markdown document before adding images.', true); return;
    }
    checkAssetBudget(assets, replacing);
    for (const file of docs) {
      const err = validateFile(file.name, file.size);
      if (err) { errors.push(`${file.name}: ${err}`); continue; }
      try {
        const text = await file.text(); if (sequence !== loadSequence) return;
        if (text.includes('\0')) { errors.push(`${file.name}: This appears to be a binary file.`); continue; }
        const name = folder ? file.webkitRelativePath : file.name;
        const relative = folder ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
        const previous = documents.find(d => d.name === name);
        addDocument({ name, text, assets: assets.size || folder ? assets : previous?.assets || emptyAssets,
          base: folder ? relative.split('/').slice(0, -1).join('/') : previous?.base || '', loose: folder ? false : previous?.loose ?? true });
      } catch (error) { errors.push(error instanceof Error ? error.message : `${file.name}: Could not read this file.`); }
    }
    if (sequence === loadSequence) notify(errors.join(' '), errors.length > 0);
  } catch (error) { if (sequence === loadSequence) notify(error instanceof Error ? error.message : 'Could not open these files.', true); }
  finally { input.value = ''; }
}
function attachAssets(assets: ImageFiles, folder: boolean, doc: OpenDocument) {
  if (!documents.includes(doc)) return;
  const next = folder ? assets : new Map([...doc.assets, ...assets]);
  checkAssetBudget(next, [doc]); doc.assets = next; doc.loose = !folder;
  if (folder) doc.base = '';
  if (documents[active] === doc) activate(active, true);
}
input.onchange = () => { void openFiles(Array.from(input.files || [])); };
$<HTMLInputElement>('folder-input').onchange = e => { const picker = e.target as HTMLInputElement; void openFiles(Array.from(picker.files || []), true); picker.value = ''; };
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => input.click()));
$('open-folder').onclick = () => $<HTMLInputElement>('folder-input').click();
for (const [button, picker, folder] of [['add-images', 'image-input', false], ['add-image-folder', 'image-folder-input', true]] as const) {
  $(button).onclick = () => { attachmentTarget = documents[active]; $<HTMLInputElement>(picker).click(); };
  $<HTMLInputElement>(picker).onchange = e => {
    const element = e.target as HTMLInputElement;
    try { if (attachmentTarget) attachAssets(selectedAssets(Array.from(element.files || []), folder), folder, attachmentTarget); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not add images.', true); }
    finally { element.value = ''; attachmentTarget = undefined; }
  };
}
$('read').onclick = () => setMode(false); $('source-toggle').onclick = () => setMode(true);
$('theme').onclick = () => setTheme(document.documentElement.dataset.theme !== 'dark'); $('wide').onclick = () => setWide(!document.body.classList.contains('wide'));
$('menu').onclick = () => { const open = document.body.classList.toggle('sidebar-open'); $('menu').setAttribute('aria-expanded', String(open)); };
$('example').onclick = () => { try { addDocument({ name: 'Welcome.md', text: SAMPLE, assets: emptyAssets, base: '', loose: true }); } catch (error) { notify(String(error), true); } };
const dialog = $<HTMLDialogElement>('paste-dialog'); let returnFocus: HTMLElement | null = null;
document.querySelectorAll('[data-paste]').forEach(b => b.addEventListener('click', () => { returnFocus = document.activeElement as HTMLElement; dialog.showModal(); $('paste-text').focus(); }));
$('cancel-paste').onclick = () => dialog.close(); dialog.addEventListener('close', () => returnFocus?.focus());
$('paste-form').onsubmit = e => {
  e.preventDefault(); const text = $<HTMLTextAreaElement>('paste-text').value;
  if (new Blob([text]).size > MAX_BYTES) { $('paste-error').textContent = 'Paste less than 2 MB of text.'; return; }
  let name = $<HTMLInputElement>('paste-name').value.trim() || 'Pasted document.md'; if (!/\.md$/i.test(name)) name += '.md';
  try { addDocument({ name, text, assets: emptyAssets, base: '', loose: true }); dialog.close(); $('paste-error').textContent = ''; }
  catch (error) { $('paste-error').textContent = String(error); }
};
$('copy').onclick = async () => {
  if (active < 0) return;
  try { await navigator.clipboard.writeText(documents[active].text); notify('Markdown copied.'); }
  catch { setMode(true); source.select(); notify('Use your browser’s copy shortcut to copy the selected source.'); }
};
$('print').onclick = async () => { const doc = documents[active]; if (!doc) return; setMode(false); await mediaReady; if (documents[active] === doc) window.print(); };
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); input.click(); } if (e.key === 'Escape') closeSidebar(); });
let dragDepth = 0;
function clearDrop() { dragDepth = 0; $('drop-overlay').hidden = true; }
function isFileDrag(e: DragEvent) { return Array.from(e.dataTransfer?.types || []).includes('Files'); }
document.addEventListener('dragenter', e => { if (isFileDrag(e)) { e.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; } });
document.addEventListener('dragover', e => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; $('drop-overlay').hidden = false; } });
document.addEventListener('dragleave', () => { if (dragDepth > 0 && --dragDepth === 0) clearDrop(); });
document.addEventListener('drop', e => { if (!isFileDrag(e)) return; e.preventDefault(); clearDrop(); if (e.dataTransfer?.files.length) void openFiles(Array.from(e.dataTransfer.files)); });
document.addEventListener('dragend', clearDrop); window.addEventListener('blur', clearDrop); document.addEventListener('keydown', e => { if (e.key === 'Escape') clearDrop(); });
preview.addEventListener('click', e => {
  const href = (e.target as Element).closest('a')?.getAttribute('href');
  if (href?.startsWith('#')) { e.preventDefault(); try { document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: 'start' }); } catch { /* invalid anchor */ } }
});
updateButtons();
setupPWA(openFiles, notify);
