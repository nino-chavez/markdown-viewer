import { marked } from 'marked';
import DOMPurify from 'dompurify';

export const MAX_BYTES = 2 * 1024 * 1024;
export function validateFile(name: string, size: number): string | null {
  if (!/\.(md|markdown|mdown|mkd|txt)$/i.test(name) && name.toLowerCase() !== 'readme') return 'Choose a Markdown (.md) or plain-text (.txt) file.';
  if (size > MAX_BYTES) return 'This file is larger than 2 MB. Open a smaller document.';
  return null;
}
export function renderMarkdown(source: string): { fragment: DocumentFragment; headings: {id:string; text:string; level:number}[]; images:number } {
  const html = marked.parse(source.replace(/^\uFEFF/, ''), { gfm:true, async:false });
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT:true, USE_PROFILES:{html:true},
    FORBID_TAGS:['style','script','iframe','object','embed','form','video','audio','source','picture','svg','math'],
    FORBID_ATTR:['style','srcset','name'], SANITIZE_NAMED_PROPS:true,
  });
  // A local viewer never requests assets embedded in a document.
  const images = fragment.querySelectorAll('img').length;
  fragment.querySelectorAll('img').forEach(img => {
    const placeholder=document.createElement('span'); placeholder.className='image-placeholder';
    placeholder.textContent=`Image not loaded${img.alt ? ': '+img.alt : ''}`; img.replaceWith(placeholder);
  });
  fragment.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  fragment.querySelectorAll('a').forEach(a=>{
    const href=a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) { a.target='_blank'; a.rel='noopener noreferrer'; }
    else if (href.startsWith('#')) { a.removeAttribute('target'); }
    else { a.removeAttribute('href'); a.title='Use Open file to open a linked local document.'; }
  });
  fragment.querySelectorAll('input').forEach(input=>{ if(input.type!=='checkbox')input.remove(); else {input.disabled=true;input.setAttribute('aria-label',input.closest('li')?.textContent?.trim()||'Checklist item');} });
  const headings:{id:string;text:string;level:number}[]=[]; const used=new Set<string>();
  fragment.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el=>{
    const base=(el.textContent||'section').toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s+/g,'-')||'section';
    let id='doc-'+base,n=2;while(used.has(id))id=`doc-${base}-${n++}`;used.add(id);el.id=id;
    headings.push({id,text:el.textContent||'Untitled section',level:Number(el.tagName[1])});
  });
  fragment.querySelectorAll('a[href^="#"]').forEach(a=>a.setAttribute('href','#doc-'+a.getAttribute('href')!.slice(1)));
  fragment.querySelectorAll('table').forEach(table=>{
    const rows=Array.from(table.rows);
    Array.from(rows[0]?.cells||[]).forEach((_,column)=>{if(rows.length>1&&rows.slice(1).every(row=>/^[\d.,%+−-]+$/.test(row.cells[column]?.textContent?.trim()||'')))rows.forEach(row=>row.cells[column]?.classList.add('numeric-cell'));});
    const wrap=document.createElement('div');wrap.className='table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable table');
    table.replaceWith(wrap);wrap.append(table);
    if((table.rows[0]?.cells.length||0)>5){wrap.classList.add('wide-table');const hint=document.createElement('p');hint.className='table-hint';hint.textContent='Scroll inside the table to see more rows and columns.';wrap.before(hint);}
  });
  return {fragment,headings,images};
}
