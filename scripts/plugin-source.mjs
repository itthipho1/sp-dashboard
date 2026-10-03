import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '/* AREAS_CORE */';
const PUBLIC_NAMES = new Set(['getAreaTags', 'buildAreaReport']);

/** Keep the tested module and the portable, dependency-free plugin in agreement. */
export function inlineAreasCore(html, source) {
  if (html.split(MARKER).length !== 2) {
    throw new Error('Expected exactly one /* AREAS_CORE */ marker in the plugin HTML.');
  }
  if (/<\/script\b/i.test(source)) {
    throw new Error('Areas source must not contain an HTML script closing tag.');
  }
  const module = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  const exported = new Set();
  for (const node of module.body) {
    if (node.type === 'ImportDeclaration') {
      throw new Error('Areas source must be dependency-free; imports are not supported.');
    }
    if (node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration') {
      throw new Error('Areas source supports only its two named declaration exports.');
    }
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration;
    if (!declaration || node.source || node.specifiers.length) {
      throw new Error('Areas source supports only named function or const declaration exports.');
    }
    let names;
    if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      names = [declaration.id.name];
    } else if (declaration.type === 'VariableDeclaration' && declaration.kind === 'const' &&
      declaration.declarations.every(item => item.id.type === 'Identifier')) {
      names = declaration.declarations.map(item => item.id.name);
    } else {
      throw new Error('Unsupported exported declaration in Areas source.');
    }
    for (const name of names) {
      if (!PUBLIC_NAMES.has(name) || exported.has(name)) {
        throw new Error(`Unexpected Areas export: ${name}`);
      }
      exported.add(name);
    }
    edits.push({ start: node.start, end: declaration.start });
  }
  for (const name of PUBLIC_NAMES) {
    if (!exported.has(name)) throw new Error(`Missing Areas export: ${name}`);
  }
  let portable = source;
  for (const edit of edits.reverse()) {
    portable = portable.slice(0, edit.start) + portable.slice(edit.end);
  }
  const injected = `const AreaReports = (() => {\n${portable}\nreturn { getAreaTags, buildAreaReport };\n})();`;
  const built = html.replace(MARKER, injected);
  const markerOffset = html.indexOf(MARKER);
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[1]));
  if (!inlineScripts.some(match => markerOffset >= match.index &&
    markerOffset < match.index + match[0].length && match[2].includes(MARKER))) {
    throw new Error('Areas marker must appear inside an inline script.');
  }
  for (const script of built.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(script[1])) continue;
    parse(script[2], { ecmaVersion: 'latest', sourceType: 'script' });
  }
  return built;
}

export function buildHtml(projectRoot = PROJECT_ROOT) {
  return inlineAreasCore(
    readFileSync(resolve(projectRoot, 'sp-dashboard/index.html'), 'utf8'),
    readFileSync(resolve(projectRoot, 'src/areas.js'), 'utf8'),
  );
}
