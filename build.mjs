import { build } from 'esbuild';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const result = await build({ entryPoints: ['src/app.ts'], bundle: true, minify: true, write: false,
  format: 'iife', target: ['safari15', 'chrome100'], legalComments: 'inline', metafile: true });
// Include license texts for every bundled package/version, including nested dependencies.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue;
  let dir = dirname(resolve(input));
  while (dir !== dirname(dir)) {
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      if (pkg.name && pkg.version) { packages.set(`${pkg.name}@${pkg.version}`, { dir, ...pkg }); break; }
    } catch { /* Walk past directories without a package manifest. */ }
    dir = dirname(dir);
  }
}
const notices = [];
for (const [name, pkg] of [...packages].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  const licenseFiles = (await readdir(pkg.dir)).filter(file => /^(licen[sc]e|copying|notice)(\.|$)/i.test(file)).sort();
  const texts = await Promise.all(licenseFiles.map(file => readFile(join(pkg.dir, file), 'utf8')));
  if (!texts.length) {
    const readme = await readFile(join(pkg.dir, 'README.md'), 'utf8');
    const section = readme.match(/^## License\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
    if (!section?.includes('Copyright') || !section.includes('Permission')) throw new Error(`Missing full license text: ${name}`);
    texts.push(section.trim());
  }
  notices.push(`${name}\n${'='.repeat(name.length)}\n${texts.join('\n\n')}`);
}
const thirdParty = `Generated from the packages included in the offline build.\n\n${notices.join('\n\n').trimEnd()}\n`;
await writeFile('THIRD_PARTY_NOTICES.txt', thirdParty);
const escapeScript = value => value.replace(/<\/script/gi, '<\\/script');
const html = (await readFile('src/index.html', 'utf8'))
  .replace('/*CSS*/', await readFile('src/style.css', 'utf8'))
  .replace('/*JS*/', () => escapeScript(result.outputFiles[0].text));
const licenseBlock = '\n<script type="text/plain" id="third-party-notices">' + escapeScript((await readFile('LICENSE', 'utf8')) + '\n\n' + thirdParty) + '</script>';
// Bundled libraries contain literal closing-body strings; append at the actual document end.
const closingBody = html.lastIndexOf('</body>');
if (closingBody < 0) throw new Error('Missing closing body tag');
const output = html.slice(0, closingBody) + licenseBlock + html.slice(closingBody);
await mkdir('dist', { recursive: true });
await writeFile('dist/Markdown Viewer.html', output);
console.log(`Built offline viewer (${Buffer.byteLength(output)} bytes; ${packages.size} dependency licenses)`);
