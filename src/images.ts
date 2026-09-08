export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_ASSET_BYTES = 64 * 1024 * 1024;
export type ImageFiles = ReadonlyMap<string, File>;
export interface ImageReference { element: HTMLElement; src: string; alt: string }

// Paths are relative to the explicitly selected folder, never to the HTML viewer.
export function localPath(value: string, base = ''): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch { return null; }
  if (!decoded || /[\\\x00-\x1f:]/.test(decoded) || decoded.startsWith('/')) return null;
  const parts = base.split('/').filter(Boolean);
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/') || null;
}

export function findImage(src: string, files: ImageFiles, base: string, loose: boolean): File | null {
  const path = localPath(src, base);
  if (!path) return null;
  const exact = files.get(path);
  if (exact) return exact;
  if (!loose) return null;
  const name = path.split('/').pop();
  const matches = [...files].filter(([key]) => key.split('/').pop() === name);
  return matches.length === 1 ? matches[0][1] : null;
}

export function isRasterFile(file: File): boolean { return /\.(png|jpe?g|webp|gif)$/i.test(file.name); }

// Read dimensions before decoding, including JPEG SOF and the three WebP encodings.
export function rasterInfo(bytes: Uint8Array): { type: string; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const u24 = (at: number) => bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16);
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 7) === 'PNG\r\n\x1a\n' && ascii(12, 4) === 'IHDR')
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6)))
    return { type: 'image/gif', width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (bytes.length >= 25 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8X' && bytes.length >= 30) return { type: 'image/webp', width: u24(24) + 1, height: u24(27) + 1 };
    if (kind === 'VP8 ' && bytes.length >= 30 && ascii(23, 3) === '\x9d\x01\x2a') return { type: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 3 < bytes.length;) {
      if (bytes[at++] !== 0xff) return null;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xd9 || marker === 0xda || at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) return null;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7)
        return { type: 'image/jpeg', width: view.getUint16(at + 5), height: view.getUint16(at + 3) };
      at += length;
    }
  }
  return null;
}

async function imageBytes(src: string, file: File | null): Promise<Uint8Array> {
  if (file) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds 8 MB');
    return new Uint8Array(await file.arrayBuffer());
  }
  const match = /^data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
  if (!match || match[1].length > MAX_IMAGE_BYTES * 1.4) throw new Error('Unsupported embedded image');
  const binary = atob(match[1].replace(/\s/g, ''));
  if (binary.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds 8 MB');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function loadImages(refs: ImageReference[], files: ImageFiles, base: string, loose: boolean,
  current: () => boolean, ownURL: (url: string) => void): Promise<{ missing: number; blocked: number }> {
  let missing = 0, blocked = 0, pixels = 0;
  for (const [index, ref] of refs.entries()) {
    if (!current()) break;
    const label = ref.alt || 'Image';
    const embedded = /^data:/i.test(ref.src);
    const path = embedded ? null : localPath(ref.src, base);
    const file = path ? findImage(ref.src, files, base, loose) : null;
    if (!embedded && !path) { ref.element.textContent = `Remote or unsupported image blocked: ${label}`; blocked++; continue; }
    if (!embedded && !file) { ref.element.textContent = `Image not found: ${label}. Add its image files or choose the document’s folder.`; missing++; continue; }
    try {
      if (index >= 20) throw new Error('Only the first 20 images are displayed');
      const bytes = await imageBytes(ref.src, file);
      if (!current()) break;
      const info = rasterInfo(bytes);
      if (!info) throw new Error('Use a PNG, JPEG, WebP, or GIF image');
      const area = info.width * info.height;
      if (!area || area > MAX_IMAGE_PIXELS || info.width > 16384 || info.height > 16384) throw new Error('Image dimensions exceed the limit');
      if (pixels + area > 32_000_000) throw new Error('Document images exceed the total pixel limit');
      pixels += area;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: info.type }));
      ownURL(url);
      const image = new Image(); image.alt = ref.alt; image.className = 'document-image'; image.src = url;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([image.decode(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Image could not be decoded')), 8000); })]); }
      finally { clearTimeout(timer); }
      if (!current()) break;
      const same = image.naturalWidth === info.width && image.naturalHeight === info.height;
      const rotated = image.naturalWidth === info.height && image.naturalHeight === info.width;
      if (!same && !rotated) throw new Error('Image dimensions do not match its header');
      ref.element.replaceWith(image);
    } catch (error) {
      if (!current()) break;
      ref.element.textContent = `${label}: ${error instanceof Error ? error.message : 'Image could not be opened'}.`;
      blocked++;
    }
  }
  return { missing, blocked };
}
