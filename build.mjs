import { build } from 'esbuild';
import { readFile, readdir, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const template = await readFile('src/index.html', 'utf8');
const css = await readFile('src/style.css', 'utf8');
const html = template
  .replace('/*CSS*/', css)
  .replace('/*JS*/', () => escapeScript(result.outputFiles[0].text));
const licenseBlock = '\n<script type="text/plain" id="third-party-notices">' + escapeScript((await readFile('LICENSE', 'utf8')) + '\n\n' + thirdParty) + '</script>';
// Bundled libraries contain literal closing-body strings; append at the actual document end.
const closingBody = html.lastIndexOf('</body>');
if (closingBody < 0) throw new Error('Missing closing body tag');
const output = html.slice(0, closingBody) + licenseBlock + html.slice(closingBody);
await mkdir('dist', { recursive: true });
await writeFile('dist/Markdown Viewer.html', output);
console.log(`Built offline viewer (${Buffer.byteLength(output)} bytes; ${packages.size} dependency licenses)`);

// The same reader also ships as a website. Only public application files go here.
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 16);
const scriptName = `app-${hash(result.outputFiles[0].text)}.js`;
const styleName = `style-${hash(css)}.css`;
const webPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; worker-src 'self'; manifest-src 'self'; font-src 'none'; base-uri 'none'; form-action 'none'";
const website = template
  .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${webPolicy}">`)
  .replace('<!--APP_HEAD-->', '<meta name="description" content="Read local Markdown, images, and diagrams. Your documents stay on your device."><meta name="theme-color" content="#235da6"><link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icons/icon-192.png"><link rel="apple-touch-icon" href="./icons/icon-192.png">')
  .replace('<style>/*CSS*/</style>', `<link rel="stylesheet" href="./${styleName}">`)
  .replace('<script>/*JS*/</script>', `<script src="./${scriptName}" defer></script>`);
await rm('dist/site', { recursive: true, force: true });
await mkdir('dist/site', { recursive: true });
await cp('public', 'dist/site', { recursive: true });
await Promise.all([
  writeFile('dist/site/index.html', website),
  writeFile(`dist/site/${scriptName}`, result.outputFiles[0].text),
  writeFile(`dist/site/${styleName}`, css),
  writeFile('dist/site/Markdown.Viewer.html', output),
  writeFile('dist/site/THIRD_PARTY_NOTICES.txt', thirdParty),
]);
const files = ['./', `./${scriptName}`, `./${styleName}`, './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const worker = await readFile('src/sw.js', 'utf8');
const version = createHash('sha256').update(worker);
for (const file of files) version.update(await readFile(join('dist/site', file === './' ? 'index.html' : file)));
await writeFile('dist/site/sw.js', worker.replace('__VERSION__', version.digest('hex').slice(0, 16)).replace('__FILES__', JSON.stringify(files)));
console.log('Built installable website in dist/site (document contents are never included)');
