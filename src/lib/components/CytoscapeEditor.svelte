<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import cytoscape, { type ElementDefinition, type Core } from 'cytoscape';
  import { editorStore } from '$lib/stores/editorStore';
  import type { RopeNode, RopeData, RopePath } from '$lib/types';
  import { NODE_TYPE_COLORS, NODE_RADIUS, EDGE_WIDTH } from '$lib/types';

  let container: HTMLDivElement;
  let cy: Core | null = null;
  let isDragging = false;
  let dragNodeId: string | null = null;

  const store = editorStore;
  const {
    moveNode,
    selectNode,
    selectRope,
    addNode,
    completeRope,
    startRopeFromNode,
    deleteNode,
    deleteRope,
    mode,
    addingNodeType,
    selectedNodeId,
    selectedRopeId,
    ropeSourceId,
    ropePaths,
    nodes,
    ropes
  } = store;

  let currentMode = $derived($mode ?? 'select');
  let currentAddingNodeType = $derived($addingNodeType ?? 'mast');
  let currentSelectedNodeId = $derived($selectedNodeId ?? null);
  let currentSelectedRopeId = $derived($selectedRopeId ?? null);
  let currentRopeSourceId = $derived($ropeSourceId ?? null);
  let currentRopePaths = $derived($ropePaths ?? new Map());
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopes = $derived($ropes ?? new Map());

  function getNodeStyle(node: RopeNode, isSelected: boolean, hasError: boolean) {
    const baseColor = NODE_TYPE_COLORS[node.type];
    const opacity = node.type === 'pulley' && !(node as any).active ? 0.4 : 1;

    return {
      'background-color': hasError ? '#DC143C' : baseColor,
      'background-opacity': opacity,
      'border-color': isSelected ? '#FFD700' : '#333',
      'border-width': isSelected ? 4 : 2,
      'width': NODE_RADIUS * 2,
      'height': NODE_RADIUS * 2
    };
  }

  function getEdgeStyle(rope: RopeData, path: RopePath | undefined, isSelected: boolean) {
    const hasError = !path?.isValid;
    const color = hasError ? '#DC143C' : (rope.color || '#CD853F');

    return {
      'line-color': color,
      'width': isSelected ? EDGE_WIDTH + 2 : EDGE_WIDTH,
      'opacity': hasError ? 0.6 : 1,
      'line-style': !path?.isClosed ? 'dashed' : 'solid'
    };
  }

  function buildElements(
    nodesData: Map<string, RopeNode>,
    ropesData: Map<string, RopeData>,
    paths: Map<string, RopePath>,
    selectedNode: string | null,
    selectedRope: string | null,
    errors: { nodeErrors: Set<string>; ropeErrors: Set<string> }
  ): ElementDefinition[] {
    const elements: ElementDefinition[] = [];

    for (const [id, node] of nodesData) {
      const isSelected = selectedNode === id;
      const hasError = errors.nodeErrors.has(id);

      elements.push({
        group: 'nodes',
        data: {
          id,
          label: `${node.label}`,
          type: node.type,
          number: node.number
        },
        position: node.position,
        style: getNodeStyle(node, isSelected, hasError)
      });
    }

    for (const [id, rope] of ropesData) {
      const isSelected = selectedRope === id;
      const path = paths.get(id);
      const hasError = errors.ropeErrors.has(id);

      elements.push({
        group: 'edges',
        data: {
          id,
          source: rope.source,
          target: rope.target,
          label: `${rope.label}\n${rope.length.toFixed(1)}m`,
          tension: rope.tension,
          hasError,
          isValid: path?.isValid ?? true,
          isClosed: path?.isClosed ?? true
        },
        style: getEdgeStyle(rope, path, isSelected)
      });
    }

    return elements;
  }

  function collectErrors(
    nodesData: Map<string, RopeNode>,
    ropesData: Map<string, RopeData>,
    paths: Map<string, RopePath>
  ): { nodeErrors: Set<string>; ropeErrors: Set<string> } {
    const nodeErrors = new Set<string>();
    const ropeErrors = new Set<string>();

    const usedNumbers = new Map<number, string[]>();
    for (const [id, node] of nodesData) {
      if (!usedNumbers.has(node.number)) {
        usedNumbers.set(node.number, []);
      }
      usedNumbers.get(node.number)!.push(id);
    }
    for (const [, ids] of usedNumbers) {
      if (ids.length > 1) {
        ids.forEach(id => nodeErrors.add(id));
      }
    }

    for (const [id, path] of paths) {
      if (!path.isValid) {
        ropeErrors.add(id);
        for (const seg of path.segments) {
          if (!seg.valid) {
            nodeErrors.add(seg.fromNode);
            nodeErrors.add(seg.toNode);
          }
        }
      }
    }

    return { nodeErrors, ropeErrors };
  }

  function render() {
    if (!cy) return;

    const errors = collectErrors(currentNodes, currentRopes, currentRopePaths);
    const elements = buildElements(currentNodes, currentRopes, currentRopePaths, currentSelectedNodeId, currentSelectedRopeId, errors);

    cy.elements().remove();
    cy.add(elements);

    if (currentSelectedNodeId) {
      cy.$(`#${currentSelectedNodeId}`).select();
    }
    if (currentSelectedRopeId) {
      cy.$(`#${currentSelectedRopeId}`).select();
    }
  }

  function handleCanvasClick(event: cytoscape.EventObject) {
    if (event.target === cy) {
      if (currentMode === 'addNode') {
        const x = event.position.x;
        const y = event.position.y;
        addNode(currentAddingNodeType, { x, y });
        mode.set('select');
      } else if (currentMode === 'select') {
        selectNode(null);
        selectRope(null);
      } else if (currentMode === 'addRope') {
        mode.set('select');
      }
    }
  }

  function handleNodeClick(event: cytoscape.EventObject) {
    const nodeId = event.target.id();

    if (currentMode === 'delete') {
      deleteNode(nodeId);
    } else if (currentMode === 'addRope') {
      if (currentRopeSourceId) {
        if (currentRopeSourceId !== nodeId) {
          completeRope(nodeId);
        }
      } else {
        startRopeFromNode(nodeId);
      }
    } else if (currentMode === 'select') {
      selectNode(nodeId);
    }
  }

  function handleEdgeClick(event: cytoscape.EventObject) {
    const edgeId = event.target.id();

    if (currentMode === 'delete') {
      deleteRope(edgeId);
    } else if (currentMode === 'select') {
      selectRope(edgeId);
    }
  }

  function handleNodeDragStart(event: cytoscape.EventObject) {
    isDragging = true;
    dragNodeId = event.target.id();
  }

  function handleNodeDragFree(event: cytoscape.EventObject) {
    if (!isDragging || !dragNodeId) return;

    const position = event.target.position();
    moveNode(dragNodeId, { x: position.x, y: position.y });
    isDragging = false;
    dragNodeId = null;
  }

  function getCursor(): string {
    switch (currentMode) {
      case 'addNode':
        return 'crosshair';
      case 'addRope':
        return 'pointer';
      case 'delete':
        return 'not-allowed';
      default:
        return 'default';
    }
  }

  $effect(() => {
    if (container) {
      container.style.cursor = getCursor();
    }
  });

  $effect(() => {
    currentNodes;
    currentRopes;
    currentRopePaths;
    currentSelectedNodeId;
    currentSelectedRopeId;
    render();
  });

  $effect(() => {
    if (cy && currentRopeSourceId) {
      cy.elements().unselect();
      cy.$(`#${currentRopeSourceId}`).select();
    }
  });

  onMount(async () => {
    await tick();

    cy = cytoscape({
      container,
      wheelSensitivity: 0.2,
      minZoom: 0.5,
      maxZoom: 3,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '10px',
            'color': '#fff',
            'text-outline-width': '1px',
            'text-outline-color': '#333',
            'overlay-padding': '6px',
            'overlay-opacity': 0
          } as any
        },
        {
          selector: 'node[type="mast"]',
          style: {
            'shape': 'rectangle',
            'width': 30,
            'height': 50
          }
        },
        {
          selector: 'node[type="pulley"]',
          style: {
            'shape': 'ellipse'
          }
        },
        {
          selector: 'node[type="mooring"]',
          style: {
            'shape': 'diamond'
          }
        },
        {
          selector: 'edge',
          style: {
            'label': 'data(label)',
            'font-size': '9px',
            'text-background-color': '#fff',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'curve-style': 'bezier',
            'control-point-step-size': '40px',
            'target-arrow-shape': 'none',
            'source-arrow-shape': 'none',
            'line-cap': 'round',
            'text-rotation': 'autorotate'
          } as any
        },
        {
          selector: 'edge[hasError="true"]',
          style: {
            'line-color': '#DC143C',
            'target-arrow-color': '#DC143C'
          }
        },
        {
          selector: 'edge[isClosed="false"]',
          style: {
            'line-style': 'dashed'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#FFD700',
            'border-width': 4
          } as any
        },
        {
          selector: 'edge:selected',
          style: {
            'width': EDGE_WIDTH + 3
          } as any
        }
      ]
    });

    cy.on('tap', handleCanvasClick);
    cy.on('tap', 'node', handleNodeClick);
    cy.on('tap', 'edge', handleEdgeClick);
    cy.on('dragstart', 'node', handleNodeDragStart);
    cy.on('dragfree', 'node', handleNodeDragFree);
  });

  onDestroy(() => {
    if (cy) {
      cy.destroy();
      cy = null;
    }
  });
</script>

<div
  bind:this={container}
  class="cy-container"
  role="presentation"
></div>
