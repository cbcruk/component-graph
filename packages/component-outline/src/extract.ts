import { parse, Lang, type SgNode } from '@ast-grep/napi';
import { runCatalog, type ShapeReading } from './catalog.js';
import {
  classifyTag,
  collapseWhitespace,
  contentChildren,
  endLine,
  isHookIdentifier,
  isJsxNode,
  kindOf,
  namedChild,
  startLine,
  stripTypeAnnotation,
  unquote,
  unwrapParen,
} from './extract.utils.js';
import {
  OUTLINE_VERSION,
  type Component,
  type HookCall,
  type ImportRef,
  type Outline,
  type Param,
  type PropBinding,
  type PropValue,
  type SkelNode,
} from './outline.types.js';

const FUNCTION_BOUNDARY = new Set([
  'arrow_function',
  'function_declaration',
  'function_expression',
  'method_definition',
]);

/**
 * Pure parse-now extractor: TSX source -> stable outline contract (v0.1).
 * Single file only; honest-partial; no cross-file resolution.
 */
export function extract(file: string, code: string): Outline {
  const root = parse(Lang.Tsx, code).root();
  const imports: ImportRef[] = [];
  const components: Component[] = [];
  const exportNames = new Set<string>();

  for (const node of root.children()) {
    const kind = node.kind();

    if (kind === 'import_statement') {
      imports.push(readImport(node));
      continue;
    }

    if (kind === 'export_statement') {
      const { inner, isDefault, names } = readExportStatement(node);
      names.forEach((n) => exportNames.add(n));
      if (inner) {
        for (const reading of runCatalog(inner)) {
          const component = buildComponent(reading, node, true, isDefault);
          if (component) {
            components.push(component);
            exportNames.add(component.name);
          }
        }
      }
      continue;
    }

    for (const reading of runCatalog(node)) {
      const component = buildComponent(reading, node, false, false);
      if (component) components.push(component);
    }
  }

  for (const component of components) {
    if (exportNames.has(component.name)) component.exported = true;
  }

  return {
    version: OUTLINE_VERSION,
    file,
    imports,
    components,
    exportsSurface: [...exportNames],
  };
}

function buildComponent(
  reading: ShapeReading,
  outerNode: SgNode,
  exported: boolean,
  isDefault: boolean,
): Component | null {
  const rootJsx = findRootJsx(reading.fnNode);
  if (!rootJsx) return null;

  return {
    name: reading.name ?? 'default',
    exported,
    isDefault,
    symbolType: reading.symbolType,
    params: readParams(reading.fnNode),
    hooks: readHooks(reading.fnNode),
    root: buildSkel(rootJsx),
    range: [startLine(outerNode), endLine(outerNode)],
  };
}

function readImport(node: SgNode): ImportRef {
  const sourceNode =
    node.field('source') ?? node.children().find((c) => c.kind() === 'string') ?? null;
  const names: string[] = [];
  const clause = node.children().find((c) => c.kind() === 'import_clause');
  if (clause) {
    for (const child of clause.children()) {
      if (child.kind() === 'identifier') {
        names.push(child.text());
      } else if (child.kind() === 'namespace_import') {
        const id = child.children().find((c) => c.kind() === 'identifier');
        if (id) names.push(id.text());
      } else if (child.kind() === 'named_imports') {
        for (const spec of child.children()) {
          if (spec.kind() !== 'import_specifier') continue;
          const name = spec.field('name');
          if (name) names.push(name.text());
        }
      }
    }
  }
  return {
    source: sourceNode ? unquote(sourceNode) : '',
    names,
    line: startLine(node),
  };
}

interface ExportInfo {
  inner: SgNode | null;
  isDefault: boolean;
  names: string[];
}

function readExportStatement(node: SgNode): ExportInfo {
  const isDefault = node.children().some((c) => c.kind() === 'default');
  let inner: SgNode | null = null;
  const names: string[] = [];

  for (const child of node.children()) {
    const kind = child.kind();
    if (
      kind === 'function_declaration' ||
      kind === 'lexical_declaration' ||
      kind === 'variable_declaration' ||
      kind === 'class_declaration'
    ) {
      inner = child;
    } else if (kind === 'export_clause') {
      for (const spec of child.children()) {
        if (spec.kind() !== 'export_specifier') continue;
        const name = spec.field('name');
        if (name) names.push(name.text());
      }
    }
  }

  return { inner, isDefault, names };
}

function readParams(fnNode: SgNode): Param[] {
  const params = fnNode.field('parameters');
  if (!params) return [];

  const items =
    params.kind() === 'formal_parameters'
      ? params
          .children()
          .filter(
            (c) =>
              c.kind() === 'required_parameter' || c.kind() === 'optional_parameter',
          )
      : [params];

  return items.map((item) => {
    if (item.kind() === 'required_parameter' || item.kind() === 'optional_parameter') {
      const typeAnnotation = item.field('type');
      const typeRef = typeAnnotation
        ? stripTypeAnnotation(typeAnnotation.text())
        : null;
      return paramFromPattern(item.field('pattern'), typeRef);
    }
    return paramFromPattern(item, null);
  });
}

function paramFromPattern(pattern: SgNode | null, typeRef: string | null): Param {
  if (!pattern) return { name: null, props: [], typeRef };
  if (pattern.kind() === 'object_pattern') {
    return { name: null, props: readObjectPattern(pattern), typeRef };
  }
  return { name: pattern.text(), props: [], typeRef };
}

function readObjectPattern(node: SgNode): PropBinding[] {
  const out: PropBinding[] = [];
  for (const child of node.children()) {
    switch (child.kind()) {
      case 'shorthand_property_identifier_pattern':
        out.push({ name: child.text(), local: null, default: null, rest: false });
        break;
      case 'object_assignment_pattern': {
        const left = child.field('left');
        const right = child.field('right');
        const def = right ? right.text() : null;
        if (left && left.kind() === 'pair_pattern') {
          const key = left.field('key');
          const value = left.field('value');
          out.push({
            name: key ? key.text() : '',
            local: renamedLocal(key, value),
            default: def,
            rest: false,
          });
        } else {
          out.push({
            name: left ? left.text() : '',
            local: null,
            default: def,
            rest: false,
          });
        }
        break;
      }
      case 'pair_pattern': {
        const key = child.field('key');
        const value = child.field('value');
        if (value && value.kind() === 'object_assignment_pattern') {
          const left = value.field('left');
          const right = value.field('right');
          out.push({
            name: key ? key.text() : '',
            local: renamedLocal(key, left),
            default: right ? right.text() : null,
            rest: false,
          });
        } else {
          out.push({
            name: key ? key.text() : '',
            local: renamedLocal(key, value),
            default: null,
            rest: false,
          });
        }
        break;
      }
      case 'rest_pattern': {
        const id = child.children().find((c) => c.kind() === 'identifier');
        out.push({ name: id ? id.text() : '', local: null, default: null, rest: true });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function renamedLocal(key: SgNode | null, value: SgNode | null): string | null {
  if (!value) return null;
  const local = value.text();
  if (key && local === key.text()) return null;
  return local;
}

function readHooks(fnNode: SgNode): HookCall[] {
  const body = fnNode.field('body');
  if (!body) return [];

  const out: HookCall[] = [];
  const visit = (node: SgNode): void => {
    if (node.kind() === 'call_expression') {
      const name = hookName(node.field('function'));
      if (name) out.push({ call: name, binds: bindsForCall(node) });
    }
    for (const child of node.children()) {
      if (FUNCTION_BOUNDARY.has(kindOf(child))) continue;
      visit(child);
    }
  };

  for (const child of body.children()) {
    if (FUNCTION_BOUNDARY.has(kindOf(child))) continue;
    visit(child);
  }
  return out;
}

function hookName(callee: SgNode | null): string | null {
  if (!callee) return null;
  if (callee.kind() === 'identifier') {
    return isHookIdentifier(callee.text()) ? callee.text() : null;
  }
  if (callee.kind() === 'member_expression') {
    const prop = callee.field('property');
    if (prop && isHookIdentifier(prop.text())) return prop.text();
  }
  return null;
}

function bindsForCall(call: SgNode): string[] {
  const parent = call.parent();
  if (!parent || parent.kind() !== 'variable_declarator') return [];
  const value = parent.field('value');
  if (!value || value.id() !== call.id()) return [];

  const nameNode = parent.field('name');
  if (!nameNode) return [];
  if (nameNode.kind() === 'array_pattern') {
    return nameNode
      .children()
      .filter((c) => c.kind() === 'identifier')
      .map((c) => c.text());
  }
  if (nameNode.kind() === 'identifier') return [nameNode.text()];
  if (nameNode.kind() === 'object_pattern') {
    return readObjectPattern(nameNode).map((b) => b.local ?? b.name);
  }
  return [];
}

function findRootJsx(fnNode: SgNode): SgNode | null {
  const body = fnNode.field('body');
  if (!body) return null;

  if (body.kind() !== 'statement_block') {
    const jsx = unwrapParen(body);
    return isJsxNode(jsx) ? jsx : null;
  }

  let found: SgNode | null = null;
  const visit = (node: SgNode): void => {
    if (found) return;
    if (node.kind() === 'return_statement') {
      const arg = node.children().find((c) => c.isNamed());
      if (arg) {
        const jsx = unwrapParen(arg);
        if (isJsxNode(jsx)) found = jsx;
      }
      return;
    }
    for (const child of node.children()) {
      if (found) return;
      if (FUNCTION_BOUNDARY.has(kindOf(child))) continue;
      visit(child);
    }
  };

  for (const child of body.children()) {
    if (found) break;
    if (FUNCTION_BOUNDARY.has(kindOf(child))) continue;
    visit(child);
  }
  return found;
}

function buildSkel(node: SgNode): SkelNode | null {
  const kind = node.kind();
  const line = startLine(node);

  if (kind === 'jsx_element') {
    const opening = node.children().find((c) => c.kind() === 'jsx_opening_element');
    const nameNode = opening ? opening.field('name') : null;
    if (!nameNode) {
      return { kind: 'fragment', children: buildChildren(node), line };
    }
    const tag = nameNode.text();
    return {
      kind: classifyTag(tag),
      tag,
      props: opening ? readJsxProps(opening) : {},
      children: buildChildren(node),
      line,
    };
  }

  if (kind === 'jsx_self_closing_element') {
    const nameNode = node.field('name');
    const tag = nameNode ? nameNode.text() : '';
    return {
      kind: classifyTag(tag),
      tag,
      props: readJsxProps(node),
      children: [],
      line,
    };
  }

  if (kind === 'jsx_expression') {
    const inner = namedChild(node);
    return { kind: 'expr', text: inner ? collapseWhitespace(inner.text()) : '', line };
  }

  if (kind === 'jsx_text') {
    const text = collapseWhitespace(node.text());
    return text ? { kind: 'text', text, line } : null;
  }

  return null;
}

function buildChildren(node: SgNode): SkelNode[] {
  const out: SkelNode[] = [];
  for (const child of contentChildren(node)) {
    const skel = buildSkel(child);
    if (skel) out.push(skel);
  }
  return out;
}

function readJsxProps(opening: SgNode): Record<string, PropValue> {
  const props: Record<string, PropValue> = {};
  for (const attr of opening.children()) {
    if (attr.kind() === 'jsx_attribute') {
      const nameNode = attr.children().find((c) => c.kind() === 'property_identifier');
      if (!nameNode) continue;
      const name = nameNode.text();
      const valueNode = attr
        .children()
        .find((c) => c.kind() === 'string' || c.kind() === 'jsx_expression');
      if (!valueNode) {
        props[name] = { kind: 'expr', text: 'true' };
      } else if (valueNode.kind() === 'string') {
        props[name] = { kind: 'literal', text: unquote(valueNode) };
      } else {
        const inner = namedChild(valueNode);
        props[name] = { kind: 'expr', text: inner ? collapseWhitespace(inner.text()) : '' };
      }
    } else if (attr.kind() === 'jsx_expression') {
      const inner = namedChild(attr);
      props['{...}'] = { kind: 'expr', text: inner ? collapseWhitespace(inner.text()) : '' };
    }
  }
  return props;
}
