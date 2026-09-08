import {describe,it,expect} from 'vitest';
import {renderMarkdown,validateFile,MAX_BYTES} from '../src/render';
describe('local document rendering',()=>{
 it('renders tables, tasks, repeated headings and matching safe anchors',()=>{
  const {fragment,headings}=renderMarkdown('# Preview\n\n[Jump](#preview)\n\n# Preview\n\n| A | B |\n|---|---|\n|1|2|\n\n- [x] Done');
  expect(headings.map(h=>h.id)).toEqual(['doc-preview','doc-preview-2']);
  expect(fragment.querySelector('a')?.getAttribute('href')).toBe('#doc-preview');
  expect(fragment.querySelector('.table-scroll table')).not.toBeNull();
  expect(fragment.querySelector('input')?.disabled).toBe(true);
 });
 it('removes active content, network images and unsafe links',()=>{
  const {fragment,images}=renderMarkdown('<script>alert(1)</script><iframe src="https://example.com"></iframe><img src="https://example.com/pixel" onerror="alert(1)" alt="Photo"><a href="javascript:alert(1)">Bad</a><p style="position:fixed" onclick="alert(1)">Text</p>');
  expect(fragment.querySelector('script,iframe,img,[onclick],[onerror],[style]')).toBeNull();
  expect(fragment.querySelector('a')?.hasAttribute('href')).toBe(false);
  expect(images).toBe(1);
  expect(fragment.textContent).toContain('Image not loaded: Photo');
 });
 it('protects external links and leaves local links inert',()=>{
  const {fragment}=renderMarkdown('[Web](https://example.com) [Local](./secret.md)');
  const links=fragment.querySelectorAll('a');expect(links[0].rel).toBe('noopener noreferrer');expect(links[1].hasAttribute('href')).toBe(false);
 });
 it('rejects unsupported and oversized files',()=>{
  expect(validateFile('report.pdf',5)).not.toBeNull();expect(validateFile('report.md',MAX_BYTES+1)).not.toBeNull();expect(validateFile('README',5)).toBeNull();
 });
});
