import type { Component, Outline, SkelNode } from 'component-outline';
import type { GNode, GNodeId, GProp, Graph } from './graph.types.js';

/**
 * Build the ephemeral graph for one component's JSX subtree. Returns null for
 * a component with no JSX root. `expr` nodes are carried opaquely — the adapter
 * never tries to resolve them (that is Tier 1, the A layer's job per-node).
 */
export function componentToGraph(component: Component): Graph | null {
  if (!component.root) return null;
  return skelToGraph(component.root);
}

export function skelToGraph(root: SkelNode): Graph {
  const nodes: Record<GNodeId, GNode> = {};
  let counter = 0;

  const add = (skel: SkelNode): GNodeId => {
    const id = `n${counter++}`;
    switch (skel.kind) {
      case 'element':
      case 'component':
        nodes[id] = {
          id,
          kind: skel.kind,
          tag: skel.tag,
          props: toProps(skel.props),
          children: skel.children.map(add),
        };
        break;
      case 'fragment':
        nodes[id] = { id, kind: 'fragment', children: skel.children.map(add) };
        break;
      case 'text':
        nodes[id] = { id, kind: 'text', text: skel.text };
        break;
      case 'expr':
        nodes[id] = { id, kind: 'expr', text: skel.text };
        break;
    }
    return id;
  };

  const root_ = add(root);
  return { root: root_, nodes };
}

/** Map each JSX-bearing component in an outline to its graph, keyed by name. */
export function outlineToGraphs(outline: Outline): Record<string, Graph> {
  const out: Record<string, Graph> = {};
  for (const component of outline.components) {
    const graph = componentToGraph(component);
    if (graph) out[component.name] = graph;
  }
  return out;
}

function toProps(props: Record<string, GProp['value']>): GProp[] {
  return Object.entries(props).map(([name, value]) => ({ name, value }));
}
