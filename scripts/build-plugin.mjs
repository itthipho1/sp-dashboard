import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';
import { parse } from 'acorn';
import { buildHtml, PROJECT_ROOT } from './plugin-source.mjs';

// Super Productivity v19.1.0 checks the extracted HTML, not ZIP compression.
export const MAX_PLUGIN_HTML_BYTES = 100 * 1024;
export const INLINE_HANDLER_GLOBALS = Object.freeze([
  'switchTab', 'setDrillDimension', 'setDrillEntity', 'setPieDimension',
]);

// Inline attribute code is minified separately from the main script. Fail on a
// new bare global unless its name is deliberately reserved across both scopes.
export function assertInlineHandlerGlobals(html) {
  const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const allowed = new Set([...INLINE_HANDLER_GLOBALS, 'event', 'window', 'document']);
  for (const attribute of markup.matchAll(/\son[a-z]+\s*=\s*/gi)) {
    if (!['"', "'"].includes(markup[attribute.index + attribute[0].length])) {
      throw new Error('Inline handler attributes must be quoted so packaging can verify their global references.');
    }
  }
  for (const handler of markup.matchAll(/\son[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const ast = parse(handler[2], { ecmaVersion: 'latest', allowReturnOutsideFunction: true });
    const visit = (node, parent, key) => {
      if (node.type === 'Identifier') {
        const staticMember = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed;
        const staticKey = parent?.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand;
        if (!staticMember && !staticKey && !allowed.has(node.name)) {
          throw new Error(`Inline handler global ${node.name} must be added to INLINE_HANDLER_GLOBALS before packaging.`);
        }
      }
      for (const [childKey, value] of Object.entries(node)) {
        if (Array.isArray(value)) {
          for (const child of value) if (child?.type) visit(child, node, childKey);
        } else if (value?.type) visit(value, node, childKey);
      }
    };
    visit(ast, null, null);
  }
}

export function assertPluginHtmlSize(html) {
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_PLUGIN_HTML_BYTES) {
    throw new Error(`Plugin index.html is ${bytes} UTF-8 bytes; Super Productivity permits at most ${MAX_PLUGIN_HTML_BYTES}.`);
  }
  return bytes;
}

export async function buildPlugin(projectRoot = PROJECT_ROOT) {
  const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(
    resolve(projectRoot, 'sp-dashboard/manifest.json.template'), 'utf8'));
  if (typeof pkg.version !== 'string' || typeof pkg.description !== 'string') {
    throw new Error('package.json must declare string version and description fields.');
  }
  if (manifest.version !== '{{VERSION}}' || manifest.description !== '{{DESCRIPTION}}') {
    throw new Error('Expected manifest VERSION and DESCRIPTION placeholders.');
  }
  manifest.version = pkg.version;
  manifest.description = pkg.description;
  const encodedManifest = JSON.stringify(manifest, null, 2) + '\n';
  if (/\{\{[A-Z_]+\}\}/.test(encodedManifest)) {
    throw new Error('Unresolved placeholder in plugin manifest.');
  }
  const sourceHtml = buildHtml(projectRoot);
  assertInlineHandlerGlobals(sourceHtml);
  const html = await minify(sourceHtml, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    // Public window properties retain their names. Bare globals used by inline
    // handlers are explicitly reserved; other bindings can be shortened safely.
    minifyJS: {
      mangle: { toplevel: true, reserved: [...INLINE_HANDLER_GLOBALS] },
      compress: { passes: 3, toplevel: false },
      format: { comments: false },
    },
  });
  const htmlBytes = assertPluginHtmlSize(html);
  const destination = resolve(projectRoot, 'build/sp-dashboard');
  mkdirSync(destination, { recursive: true });
  writeFileSync(resolve(destination, 'index.html'), html, 'utf8');
  writeFileSync(resolve(destination, 'manifest.json'), encodedManifest, 'utf8');
  for (const name of ['plugin.js', 'icon.svg']) {
    copyFileSync(resolve(projectRoot, 'sp-dashboard', name), resolve(destination, name));
  }
  copyFileSync(resolve(projectRoot, 'LICENSE'), resolve(destination, 'LICENSE'));
  return { html, htmlBytes, manifest, destination };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await buildPlugin();
  console.log(`Built ${result.manifest.id} v${result.manifest.version}: ${result.destination} (${result.htmlBytes}/${MAX_PLUGIN_HTML_BYTES} HTML bytes)`);
}
