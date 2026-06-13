<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import cytoscape, { type ElementDefinition, type Core } from 'cytoscape';
  import { editorStore } from '$lib/stores/editorStore';
  import type { RopeNode, RopeData, RopePath, PathSegment } from '$lib/types';
  import { NODE_TYPE_COLORS, NODE_RADIUS, EDGE_WIDTH, applyOffset } from '$lib/types';

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
    addNodeToBuildingPath,
    finishBuildingRope,
    startBuildingRope,
    cancelBuildingRope,
    deleteNode,
    deleteRope,
    mode,
    addingNodeType,
    selectedNodeId,
    selectedRopeId,
    ropeBuildingPath,
    ropePaths,
    nodes,
    ropes,
    selectedPathNodeIndex,
    selectPathNodeIndex
  } = store;

  let currentMode = $derived($mode ?? 'select');
  let currentAddingNodeType = $derived($addingNodeType ?? 'mast');
  let currentSelectedNodeId = $derived($selectedNodeId ?? null);
  let currentSelectedRopeId = $derived($selectedRopeId ?? null);
  let currentRopeBuildingPath = $derived($ropeBuildingPath ?? []);
  let currentRopePaths = $derived($ropePaths ?? new Map());
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopes = $derived($ropes ?? new Map());
  let currentSelectedPathNodeIndex = $derived($selectedPathNodeIndex ?? null);

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

  function getEdgeStyle(
    rope: RopeData,
    segment: PathSegment,
    path: RopePath | undefined,
    isSelected: boolean
  ) {
    const hasError = !path?.isValid || !segment.valid;
    const color = hasError ? '#DC143C' : (rope.color || '#CD853F');
    const isContinuous = path?.isContinuous ?? true;

    return {
      'line-color': color,
      'width': isSelected ? EDGE_WIDTH + 2 : EDGE_WIDTH,
      'opacity': hasError ? 0.6 : 1,
      'line-style': !isContinuous ? 'dashed' : 'solid'
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

    for (const [ropeId, rope] of ropesData) {
      const isSelected = selectedRope === ropeId;
      const path = paths.get(ropeId);
      const hasError = errors.ropeErrors.has(ropeId);

      const segments = path?.segments ?? [];
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segId = `${ropeId}-seg-${i}`;

        elements.push({
          group: 'edges',
          data: {
            id: segId,
            ropeId,
            segmentIndex: i,
            source: segment.fromNode,
            target: segment.toNode,
            label: `${rope.label} · ${i + 1}\n${segment.length.toFixed(1)}m`,
            tension: rope.tension,
            hasError: hasError || !segment.valid,
            isValid: path?.isValid ?? true,
            isContinuous: path?.isContinuous ?? true
          },
          style: getEdgeStyle(rope, segment, path, isSelected)
        });
      }

      for (let i = 0; i < rope.nodePath.length; i++) {
        const chainNode = rope.nodePath[i];
        const node = nodesData.get(chainNode.nodeId);
        if (!node) continue;

        const entryPos = applyOffset(node.position, chainNode.entryOffset);
        const exitPos = applyOffset(node.position, chainNode.exitOffset);
        const isPathNodeSelected = isSelected && currentSelectedPathNodeIndex === i;

        if (i > 0) {
          elements.push({
            group: 'nodes',
            data: {
              id: `${ropeId}-entry-${i}`,
              parentNodeId: node.id,
              ropeId,
              pathNodeIndex: i,
              isEntryPoint: true,
              label: '',
              type: 'offsetPoint'
            },
            position: entryPos,
            style: {
              'background-color': isPathNodeSelected ? '#FFD700' : '#00CED1',
              'background-opacity': isSelected ? 1 : 0.6,
              'border-color': '#fff',
              'border-width': 2,
              'width': 12,
              'height': 12,
              'shape': 'triangle',
              'label': ''
            }
          });
        }

        if (i < rope.nodePath.length - 1) {
          elements.push({
            group: 'nodes',
            data: {
              id: `${ropeId}-exit-${i}`,
              parentNodeId: node.id,
              ropeId,
              pathNodeIndex: i,
              isExitPoint: true,
              label: '',
              type: 'offsetPoint'
            },
            position: exitPos,
            style: {
              'background-color': isPathNodeSelected ? '#FFD700' : '#FF6347',
              'background-opacity': isSelected ? 1 : 0.6,
              'border-color': '#fff',
              'border-width': 2,
              'width': 12,
              'height': 12,
              'shape': 'triangle',
              'label': ''
            }
          });
        }
      }
    }

    if (currentMode === 'addRope' && currentRopeBuildingPath.length > 0) {
      for (let i = 0; i < currentRopeBuildingPath.length; i++) {
        const nodeId = currentRopeBuildingPath[i];
        const node = nodesData.get(nodeId);
        if (!node) continue;

        if (i > 0) {
          const prevNodeId = currentRopeBuildingPath[i - 1];
          elements.push({
            group: 'edges',
            data: {
              id: `preview-seg-${i}`,
              source: prevNodeId,
              target: nodeId,
              label: `预览 ${i}`,
              isPreview: true
            },
            style: {
              'line-color': '#32CD32',
              'width': EDGE_WIDTH,
              'opacity': 0.7,
              'line-style': 'dashed'
            }
          });
        }
      }
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
        for (const e of path.inactivePulleyErrors) {
          nodeErrors.add(e.nodeId);
        }
        for (const e of path.pulleyDirectionErrors) {
          nodeErrors.add(e.nodeId);
        }
      }
    }

    return { nodeErrors, ropeErrors };
  }

  function render() {
    if (!cy) return;

    const errors = collectErrors(currentNodes, currentRopes, currentRopePaths);
    const elements = buildElements(
      currentNodes,
      currentRopes,
      currentRopePaths,
      currentSelectedNodeId,
      currentSelectedRopeId,
      errors
    );

    cy.elements().remove();
    cy.add(elements);

    if (currentSelectedNodeId) {
      cy.$(`#${currentSelectedNodeId}`).select();
    }
    if (currentSelectedRopeId) {
      cy.elements(`[ropeId = "${currentSelectedRopeId}"]`).select();
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
        selectPathNodeIndex(null);
      } else if (currentMode === 'addRope') {
        if (currentRopeBuildingPath.length >= 2) {
          finishBuildingRope();
        } else {
          cancelBuildingRope();
        }
      }
    }
  }

  function handleNodeClick(event: cytoscape.EventObject) {
    const nodeId = event.target.id();
    const data = event.target.data();

    if (data.type === 'offsetPoint') {
      if (currentMode === 'select' && data.ropeId) {
        selectRope(data.ropeId);
        selectPathNodeIndex(data.pathNodeIndex);
      }
      return;
    }

    if (currentMode === 'delete') {
      deleteNode(nodeId);
    } else if (currentMode === 'addRope') {
      if (currentRopeBuildingPath.length === 0) {
        startBuildingRope(nodeId);
      } else {
        const added = addNodeToBuildingPath(nodeId);
        if (added) {
          // 继续添加节点，用户点击画布空白或按回车完成
        }
      }
    } else if (currentMode === 'select') {
      selectNode(nodeId);
      selectPathNodeIndex(null);
    }
  }

  function handleEdgeClick(event: cytoscape.EventObject) {
    const edgeId = event.target.id();
    const data = event.target.data();

    if (data.isPreview) return;

    if (currentMode === 'delete') {
      if (data.ropeId) {
        deleteRope(data.ropeId);
      }
    } else if (currentMode === 'select') {
      if (data.ropeId) {
        selectRope(data.ropeId);
        selectPathNodeIndex(null);
      }
    }
  }

  function handleNodeDragStart(event: cytoscape.EventObject) {
    const data = event.target.data();
    if (data.type === 'offsetPoint') return;

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
    currentRopeBuildingPath;
    currentMode;
    currentSelectedPathNodeIndex;
    render();
  });

  $effect(() => {
    if (cy && currentRopeBuildingPath.length > 0) {
      cy.elements().unselect();
      for (const nid of currentRopeBuildingPath) {
        cy.$(`#${nid}`).select();
      }
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
          selector: 'edge[isContinuous="false"]',
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
        },
        {
          selector: 'node[type="offsetPoint"]',
          style: {
            'label': '',
            'text-valign': 'center',
            'text-halign': 'center',
            'overlay-padding': '0px',
            'overlay-opacity': 0
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
