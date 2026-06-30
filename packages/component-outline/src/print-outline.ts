import type { Component, Outline, Param, SkelNode } from './outline.types.js';

export function printOutline(outline: Outline): string {
  const lines: string[] = [];
  lines.push(`${outline.file}  (outline v${outline.version})`);

  if (outline.imports.length > 0) {
    lines.push('  imports:');
    for (const imp of outline.imports) {
      const names = imp.names.length > 0 ? imp.names.join(', ') : '*';
      lines.push(`    ${names}  ←  ${imp.source}  (L${imp.line})`);
    }
  }

  for (const component of outline.components) {
    lines.push('');
    lines.push(printComponentHeader(component));
    if (component.params.length > 0) {
      lines.push(`    props: ${component.params.map(printParam).join('; ')}`);
    }
    if (component.hooks.length > 0) {
      const hooks = component.hooks
        .map((h) => (h.binds.length > 0 ? `${h.call} → [${h.binds.join(', ')}]` : h.call))
        .join(', ');
      lines.push(`    hooks: ${hooks}`);
    }
    if (component.root) {
      printSkel(component.root, 2, lines);
    }
  }

  if (outline.exportsSurface.length > 0) {
    lines.push('');
    lines.push(`  exports: ${outline.exportsSurface.join(', ')}`);
  }

  return lines.join('\n');
}

function printComponentHeader(component: Component): string {
  const tags = [
    component.symbolType,
    component.exported ? (component.isDefault ? 'export default' : 'export') : 'local',
  ];
  if (component.wrappers.length > 0) tags.push(component.wrappers.join('→'));
  return `  <${component.name}>  (${tags.join(', ')})  [L${component.range[0]}–${component.range[1]}]`;
}

function printParam(param: Param): string {
  const type = param.typeRef ? `: ${param.typeRef}` : '';
  if (param.name) return `${param.name}${type}`;
  const props = param.props
    .map((p) => {
      let label = p.rest ? `...${p.name}` : p.name;
      if (p.local) label += ` as ${p.local}`;
      if (p.default) label += ` = ${p.default}`;
      return label;
    })
    .join(', ');
  return `{ ${props} }${type}`;
}

function printSkel(node: SkelNode, depth: number, lines: string[]): void {
  const pad = '  '.repeat(depth);
  switch (node.kind) {
    case 'element':
    case 'component': {
      const props = Object.entries(node.props)
        .map(([k, v]) => (v.kind === 'literal' ? `${k}="${v.text}"` : `${k}={${v.text}}`))
        .join(' ');
      const head = props ? `<${node.tag} ${props}>` : `<${node.tag}>`;
      lines.push(`${pad}${head}`);
      for (const child of node.children) printSkel(child, depth + 1, lines);
      break;
    }
    case 'fragment':
      lines.push(`${pad}<>`);
      for (const child of node.children) printSkel(child, depth + 1, lines);
      break;
    case 'text':
      lines.push(`${pad}"${node.text}"`);
      break;
    case 'expr':
      lines.push(`${pad}{${node.text}}`);
      break;
  }
}
