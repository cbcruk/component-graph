import type { GNodeId, GProp, Graph } from './graph.types.js';

const INDENT = '  ';

/** Project a graph subtree back to JSX text (canonical formatting). */
export function projectNode(graph: Graph, id: GNodeId, depth = 0): string {
  const node = graph.nodes[id];
  if (!node) throw new Error(`projectNode: unknown node ${id}`);
  const pad = INDENT.repeat(depth);

  switch (node.kind) {
    case 'element':
    case 'component': {
      const attrs = node.props.map(projectProp).join(' ');
      const open = attrs ? `${node.tag} ${attrs}` : node.tag;
      if (node.children.length === 0) return `${pad}<${open} />`;
      const inner = node.children
        .map((child) => projectNode(graph, child, depth + 1))
        .join('\n');
      return `${pad}<${open}>\n${inner}\n${pad}</${node.tag}>`;
    }
    case 'fragment': {
      if (node.children.length === 0) return `${pad}<></>`;
      const inner = node.children
        .map((child) => projectNode(graph, child, depth + 1))
        .join('\n');
      return `${pad}<>\n${inner}\n${pad}</>`;
    }
    case 'text':
      return `${pad}${node.text}`;
    case 'expr':
      return `${pad}{${node.text}}`;
  }
}

/** Project the whole graph (from its root). */
export function projectGraph(graph: Graph): string {
  return projectNode(graph, graph.root);
}

function projectProp(prop: GProp): string {
  if (prop.name === '{...}') return `{...${prop.value.text}}`;
  if (prop.value.kind === 'literal') return `${prop.name}="${prop.value.text}"`;
  return `${prop.name}={${prop.value.text}}`;
}
