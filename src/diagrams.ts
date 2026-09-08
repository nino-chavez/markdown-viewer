import mermaid from 'mermaid';
import DOMPurify from 'dompurify';

let sequence = 0;
let queue: Promise<void> = Promise.resolve();

export function diagramProblem(source: string): string | null {
  if (source.length > 8000 || source.split('\n').length > 200) return 'Diagram exceeds the size limit.';
  if (/^\s*---|%%\s*\{|[\\]|<\s*\/?[a-z!]|(?:(?:https?|ftp|file|data|blob|javascript|vbscript):|\/\/)|@import|url\s*\(|\b(?:img|icon)\s*:/im.test(source.replace(/#[0-9a-f]{3,8}\b/gi, '')))
    return 'Diagram settings, HTML, external resources, and image or icon nodes are not supported.';
  return null;
}

function configuration(dark: boolean) {
  return {
    startOnLoad: false, securityLevel: 'strict' as const, suppressErrorRendering: true,
    htmlLabels: false, maxTextSize: 8000, maxEdges: 200, theme: 'base' as const,
    fontFamily: 'Arial, sans-serif', flowchart: { htmlLabels: false },
    themeVariables: dark ? {
      darkMode: true, background: '#1c2027', primaryColor: '#29384d', primaryTextColor: '#e6eaf0',
      primaryBorderColor: '#9cc7ff', lineColor: '#a4aebb', secondaryColor: '#252c35', tertiaryColor: '#252c35',
      secondaryTextColor: '#e6eaf0', tertiaryTextColor: '#e6eaf0', textColor: '#e6eaf0',
      actorTextColor: '#e6eaf0', actorBkg: '#29384d', actorBorder: '#9cc7ff', signalColor: '#e6eaf0', signalTextColor: '#e6eaf0',
    } : {
      background: '#ffffff', primaryColor: '#eaf0f8', primaryTextColor: '#202630', primaryBorderColor: '#235da6',
      lineColor: '#606976', secondaryColor: '#f3f5f7', tertiaryColor: '#f3f5f7', textColor: '#202630',
    },
    secure: ['secure','securityLevel','startOnLoad','suppressErrorRendering','maxTextSize','maxEdges','htmlLabels','flowchart','theme','themeVariables','themeCSS','fontFamily'],
  };
}

async function renderSVG(source: string, dark: boolean): Promise<{ svg: string; alt: string }> {
  mermaid.initialize(configuration(dark));
  const stage = document.createElement('div');
  stage.className = 'diagram-stage'; stage.setAttribute('aria-hidden', 'true'); document.body.append(stage);
  try {
    const result = await mermaid.render(`diagram-${++sequence}`, source, stage);
    const fragment = DOMPurify.sanitize(result.svg, {
      RETURN_DOM_FRAGMENT: true, USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject','image','use','script','a','animate','set'],
      FORBID_ATTR: ['href','xlink:href','src','onload','onclick'],
    });
    const svg = fragment.querySelector('svg');
    if (!svg) throw new Error('No diagram was produced');
    const bounds = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
    if (bounds?.length === 4 && bounds[2] > 0 && bounds[3] > 0) {
      if (bounds[2] * bounds[3] > 16_000_000 || Math.max(bounds[2], bounds[3]) > 16384) throw new Error('Diagram dimensions exceed the limit');
      svg.setAttribute('width', String(Math.ceil(bounds[2]))); svg.setAttribute('height', String(Math.ceil(bounds[3])));
    }
    const alt = [svg.querySelector('title')?.textContent, svg.querySelector('desc')?.textContent].filter(Boolean).join('. ');
    return { svg: new XMLSerializer().serializeToString(svg), alt: alt || 'Mermaid diagram. Its text is available in Diagram source below.' };
  } finally { stage.remove(); }
}

export function loadDiagrams(root: HTMLElement, current: () => boolean, ownURL: (url: string) => void): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')];
  const run = async () => {
    for (const [index, code] of blocks.entries()) {
      if (!current()) return;
      const source = code.textContent || '';
      const figure = document.createElement('figure'); figure.className = 'diagram';
      const status = document.createElement('p'); status.className = 'diagram-status'; status.textContent = 'Rendering diagram…';
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Diagram source';
      const pre = document.createElement('pre'); const original = document.createElement('code'); original.textContent = source;
      pre.append(original); details.append(summary, pre); figure.append(status, details);
      code.parentElement!.replaceWith(figure);
      const problem = index >= 10 ? 'Only the first 10 diagrams are rendered.' : diagramProblem(source);
      if (problem) { status.textContent = problem; details.open = true; continue; }
      try {
        for (const dark of [false, true]) {
          if (!current()) return;
          const rendered = await renderSVG(source, dark);
          if (!current()) return;
          // SVG image documents cannot execute scripts or escape into the reader's DOM.
          const url = URL.createObjectURL(new Blob([rendered.svg], { type: 'image/svg+xml' })); ownURL(url);
          const image = new Image(); image.src = url; image.alt = rendered.alt;
          image.className = dark ? 'diagram-dark' : 'diagram-light';
          await image.decode();
          if (!current()) return;
          figure.insertBefore(image, details);
        }
        status.remove();
      } catch {
        if (!current()) return;
        figure.querySelectorAll('img').forEach(image => image.remove());
        status.textContent = 'Diagram could not be rendered. Its source is shown below.'; details.open = true;
      }
    }
  };
  // Mermaid has shared configuration. Keep all renders ordered, including rapid document changes.
  const work = queue.then(run, run);
  queue = work.catch(() => {});
  return work;
}
