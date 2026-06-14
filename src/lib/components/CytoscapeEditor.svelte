<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import cytoscape, { type ElementDefinition, type Core } from 'cytoscape';
  import { editorStore } from '$lib/stores/editorStore';
  import type { RopeNode, RopeData, RopePath, PathSegment, ReviewComment } from '$lib/types';
  import {
    NODE_TYPE_COLORS,
    NODE_RADIUS,
    EDGE_WIDTH,
    applyOffset,
    REVIEW_STATUS_COLORS,
    REVIEW_STATUS_LABELS,
    REVIEW_PRIORITY_BADGE,
    REVIEW_PRIORITY_LABELS,
    REVIEW_USER_ROLE_LABELS
  } from '$lib/types';

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
    selectPathNodeIndex,
    currentDiff,
    viewingVersionId,
    isPlaybackMode,
    playbackIndex,
    playbackSteps,
    isReviewSelectionActive,
    reviewSelection,
    addNodeToReviewSelection,
    removeNodeFromReviewSelection,
    addRopeToReviewSelection,
    removeRopeFromReviewSelection,
    reviewComments,
    selectedReviewCommentId,
    setSelectedReviewComment,
    showPlaybackComments,
    diffFilterCommentId
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
  let diff = $derived($currentDiff ?? null);
  let currentViewingId = $derived($viewingVersionId ?? null);
  let currentIsPlayback = $derived($isPlaybackMode ?? false);
  let currentPlaybackIndex = $derived($playbackIndex ?? -1);
  let currentPlaybackSteps = $derived($playbackSteps ?? []);
  let currentDiffFilterCommentId = $derived($diffFilterCommentId ?? null);
  let currentVersions = $derived($versions ?? []);

  let currentIsReviewSelectionActive = $derived($isReviewSelectionActive ?? false);
  let currentReviewSelection = $derived($reviewSelection);
  let currentReviewComments = $derived($reviewComments ?? []);
  let currentSelectedReviewCommentId = $derived($selectedReviewCommentId ?? null);
  let currentShowPlaybackComments = $derived($showPlaybackComments ?? true);

  const currentVersionId = $derived(() => {
    if (currentViewingId) return currentViewingId;
    if (currentIsPlayback && currentPlaybackIndex >= 0) {
      return currentPlaybackSteps[currentPlaybackIndex]?.snapshot.id || null;
    }
    return null;
  });

  const commentsForCurrentContext = $derived(() => {
    const vid = currentVersionId();
    if (!vid) return [] as ReviewComment[];
    return currentReviewComments.filter(c => c.versionId === vid);
  });

  const activeComment = $derived(() => {
    if (!currentSelectedReviewCommentId) return null;
    return currentReviewComments.find(c => c.id === currentSelectedReviewCommentId) || null;
  });

  function isInReviewSelection(type: 'node' | 'rope', id: string): boolean {
    if (type === 'node') {
      return (currentReviewSelection.nodeIds || []).includes(id);
    }
    if (type === 'rope') {
      return (currentReviewSelection.ropeIds || []).includes(id);
    }
    return false;
  }

  function isTargetOfSelectedComment(type: 'node' | 'rope', id: string): boolean {
    const c = activeComment();
    if (!c) return false;
    if (type === 'node') return (c.selection.nodeIds || []).includes(id);
    if (type === 'rope') return (c.selection.ropeIds || []).includes(id);
    return false;
  }

  function isTargetOfDiffFilterComment(type: 'node' | 'rope', id: string): boolean {
    if (!currentDiffFilterCommentId || !diff) return false;
    const c = currentReviewComments.find(x => x.id === currentDiffFilterCommentId);
    if (!c) return false;
    const targetNodeIds = new Set(c.selection.nodeIds || []);
    const targetRopeIds = new Set(c.selection.ropeIds || []);
    if (type === 'node' && targetNodeIds.has(id)) return true;
    if (type === 'rope' && targetRopeIds.has(id)) return true;
    if (type === 'node') {
      for (const rd of diff.ropeDiffs) {
        if (!targetRopeIds.has(rd.ropeId)) continue;
        const rope = rd.newRope || rd.oldRope;
        if (rope && rope.nodePath.some(cn => cn.nodeId === id)) return true;
      }
    }
    if (type === 'rope') {
      const rd = diff.ropeDiffs.find(x => x.ropeId === id);
      if (rd) {
        const rope = rd.newRope || rd.oldRope;
        if (rope && rope.nodePath.some(cn => targetNodeIds.has(cn.nodeId))) return true;
      }
    }
    return false;
  }

  function commentTargetingElement(type: 'node' | 'rope', id: string): ReviewComment[] {
    const result: ReviewComment[] = [];
    for (const c of commentsForCurrentContext()) {
      if (type === 'node' && (c.selection.nodeIds || []).includes(id)) {
        result.push(c);
      } else if (type === 'rope' && (c.selection.ropeIds || []).includes(id)) {
        result.push(c);
      }
    }
    return result;
  }

  function getElementPriorityBadge(comments: ReviewComment[]): string | null {
    if (comments.length === 0) return null;
    let highest: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const order = { low: 0, medium: 1, high: 2, critical: 3 };
    for (const c of comments) {
      if (order[c.priority] > order[highest]) highest = c.priority;
    }
    return REVIEW_PRIORITY_BADGE[highest];
  }

  function getDiffChangeForNode(nodeId: string): string | null {
    if (!diff) return null;
    const nodeDiff = diff.nodeDiffs.find(nd => nd.nodeId === nodeId);
    return nodeDiff?.changeType || null;
  }

  function getDiffChangeForRope(ropeId: string): string | null {
    if (!diff) return null;
    const ropeDiff = diff.ropeDiffs.find(rd => rd.ropeId === ropeId);
    return ropeDiff?.changeType || null;
  }

  function getNodeStyle(node: RopeNode, isSelected: boolean, hasError: boolean) {
    const baseColor = NODE_TYPE_COLORS[node.type];
    const opacity = node.type === 'pulley' && !(node as any).active ? 0.4 : 1;
    const diffChange = getDiffChangeForNode(node.id);

    let borderColor = isSelected ? '#FFD700' : '#333';
    let borderWidth = isSelected ? 4 : 2;
    let backgroundColor = hasError ? '#DC143C' : baseColor;
    let backgroundOpacity = opacity;

    const inReviewSel = currentIsReviewSelectionActive && isInReviewSelection('node', node.id);
    const targetOfComment = isTargetOfSelectedComment('node', node.id);
    const inDiffFilter = isTargetOfDiffFilterComment('node', node.id);

    if (currentDiffFilterCommentId && !inDiffFilter) {
      backgroundOpacity = Math.max(0.2, backgroundOpacity * 0.3);
    }

    if (inReviewSel) {
      borderColor = '#F59E0B';
      borderWidth = 6;
    } else if (targetOfComment) {
      borderColor = '#6366F1';
      borderWidth = 5;
    } else if (inDiffFilter) {
      borderColor = '#0EA5E9';
      borderWidth = 5;
    }

    if (diffChange) {
      switch (diffChange) {
        case 'added':
          borderColor = '#22C55E';
          borderWidth = Math.max(borderWidth, 5);
          break;
        case 'removed':
          borderColor = '#EF4444';
          borderWidth = Math.max(borderWidth, 5);
          break;
        case 'modified':
          borderColor = '#F59E0B';
          borderWidth = Math.max(borderWidth, 5);
          break;
      }
    }

    return {
      'background-color': backgroundColor,
      'background-opacity': backgroundOpacity,
      'border-color': borderColor,
      'border-width': borderWidth,
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
    let color = hasError ? '#DC143C' : (rope.color || '#CD853F');
    const isContinuous = path?.isContinuous ?? true;
    const diffChange = getDiffChangeForRope(rope.id);

    let width = isSelected ? EDGE_WIDTH + 2 : EDGE_WIDTH;
    let lineStyle: string = !isContinuous ? 'dashed' : 'solid';
    let opacity = hasError ? 0.6 : 1;

    const inReviewSel = currentIsReviewSelectionActive && isInReviewSelection('rope', rope.id);
    const targetOfComment = isTargetOfSelectedComment('rope', rope.id);
    const inDiffFilter = isTargetOfDiffFilterComment('rope', rope.id);

    if (currentDiffFilterCommentId && !inDiffFilter) {
      opacity = Math.max(0.15, opacity * 0.2);
    }

    if (inReviewSel) {
      width = EDGE_WIDTH + 6;
      color = '#F59E0B';
    } else if (targetOfComment) {
      width = EDGE_WIDTH + 5;
      color = '#6366F1';
    } else if (inDiffFilter) {
      width = EDGE_WIDTH + 5;
      color = '#0EA5E9';
    }

    if (diffChange) {
      width = Math.max(width, EDGE_WIDTH + 4);
      switch (diffChange) {
        case 'added':
          color = '#22C55E';
          break;
        case 'removed':
          color = '#EF4444';
          lineStyle = 'dashed';
          break;
        case 'modified':
          color = '#F59E0B';
          break;
      }
    }

    return {
      'line-color': color,
      'width': width,
      'opacity': opacity,
      'line-style': lineStyle
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
      const comments = commentTargetingElement('node', id);
      const topComment = comments.sort((a, b) => {
        const priorityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })[0];
      const priorityColor = topComment ? REVIEW_PRIORITY_BADGE[topComment.priority] : null;

      let labelText = `${node.label}`;
      if (comments.length > 0) {
        const unresolved = comments.filter(c => c.status !== 'closed' && c.status !== 'resolved' && c.status !== 'verified').length;
        if (unresolved > 0) {
          labelText = `${node.label}\n💬${unresolved}`;
        }
      }

      elements.push({
        group: 'nodes',
        data: {
          id,
          label: labelText,
          type: node.type,
          number: node.number,
          commentCount: comments.length,
          commentNumber: topComment?.commentNumber || null,
          priorityBadge: priorityColor
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
        const ropeComments = commentTargetingElement('rope', ropeId);

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
            isContinuous: path?.isContinuous ?? true,
            commentCount: ropeComments.length
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

    if (currentIsReviewSelectionActive) {
      for (const nid of currentReviewSelection.nodeIds || []) {
        cy.$(`#${nid}`).select();
      }
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
      } else if (currentMode === 'review') {
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
      if (currentMode === 'review') return;
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
        }
      }
    } else if (currentMode === 'review') {
      if (currentReviewSelection.targetType === 'rope') return;
      if (isInReviewSelection('node', nodeId)) {
        removeNodeFromReviewSelection(nodeId);
      } else {
        addNodeToReviewSelection(nodeId);
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
    } else if (currentMode === 'review') {
      if (!data.ropeId) return;
      if (currentReviewSelection.targetType === 'node') return;
      if (isInReviewSelection('rope', data.ropeId)) {
        removeRopeFromReviewSelection(data.ropeId);
      } else {
        addRopeToReviewSelection(data.ropeId);
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
    if (currentMode === 'review') { event.preventDefault(); return; }

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
      case 'review':
        return 'crosshair';
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
    currentReviewSelection;
    currentSelectedReviewCommentId;
    currentIsReviewSelectionActive;
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

  $effect(() => {
    if (cy && currentIsReviewSelectionActive) {
      cy.elements().unselect();
      for (const nid of currentReviewSelection.nodeIds || []) {
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

<div class="relative h-full w-full">
  <div
    bind:this={container}
    class="cy-container"
    role="presentation"
  ></div>

  {#if currentIsReviewSelectionActive}
    <div class="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-amber-500/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 text-xs text-white max-w-[90%]">
      <span class="font-bold">🎯 圈选批注模式</span>
      <span class="opacity-90">
        {#if currentReviewSelection.targetType === 'node'}
          点击节点圈选
        {:else if currentReviewSelection.targetType === 'rope'}
          点击缆绳圈选
        {:else}
          全局批注模式
        {/if}
      </span>
      {#if (currentReviewSelection.nodeIds?.length || 0) > 0 || (currentReviewSelection.ropeIds?.length || 0) > 0}
        <span class="px-1.5 py-0.5 bg-white/20 rounded">
          已选 {(currentReviewSelection.nodeIds?.length || 0) + (currentReviewSelection.ropeIds?.length || 0)} 项
        </span>
      {/if}
    </div>
  {/if}

  {#if diff}
    <div class="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg border border-amber-300 flex items-center gap-2 text-xs {currentIsReviewSelectionActive ? 'mt-10' : ''}">
      <span class="font-bold text-amber-700">🔍 差异对比模式</span>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-full border-2 border-green-500 bg-white"></span>
        <span class="text-gray-600">新增</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-full border-2 border-red-500 bg-white"></span>
        <span class="text-gray-600">删除</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-full border-2 border-amber-500 bg-white"></span>
        <span class="text-gray-600">修改</span>
      </div>
    </div>
  {/if}

  {#if currentIsPlayback}
    <div class="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-purple-500/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 text-xs text-white {currentIsReviewSelectionActive ? 'mt-10' : ''}">
      <span class="font-bold">🎬 回放模式</span>
      <span>步骤 {currentPlaybackIndex + 1}/{currentPlaybackSteps.length}</span>
      {#if currentPlaybackIndex >= 0 && currentPlaybackSteps[currentPlaybackIndex]}
        <span class="opacity-80">
          · v{currentPlaybackSteps[currentPlaybackIndex].snapshot.versionNumber}
        </span>
      {/if}
    </div>
  {:else if currentViewingId}
    <div class="absolute top-2 right-2 z-10 bg-blue-500/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg text-xs text-white {currentIsReviewSelectionActive ? 'mt-10' : ''}">
      <span class="font-bold">👁 查看历史版本</span>
    </div>
  {/if}

  {#if currentDiffFilterCommentId}
    <div class="absolute top-2 right-2 z-30 bg-sky-500/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 text-xs text-white">
      <span class="font-bold">🎯 按批注筛选差异</span>
      <span class="opacity-90">
        {#each currentReviewComments.filter(x => x.id === currentDiffFilterCommentId) as fc}
          #{fc.commentNumber} · {fc.content.substring(0, 20)}{fc.content.length > 20 ? '...' : ''}
        {/each}
      </span>
      <button
        type="button"
        onclick={() => store.setDiffFilterCommentId(null)}
        class="ml-1 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[10px]"
      >
        ✕ 清除
      </button>
    </div>
  {/if}

  {#if commentsForCurrentContext().length > 0 && currentShowPlaybackComments && !currentIsReviewSelectionActive && !currentDiffFilterCommentId}
    <div class="absolute top-2 left-2 z-10 flex flex-col gap-1 max-w-[220px]">
      {#each commentsForCurrentContext().slice(0, 5) as c}
        <button
          type="button"
          onclick={() => setSelectedReviewComment(currentSelectedReviewCommentId === c.id ? null : c.id)}
          class="text-left px-2 py-1.5 rounded shadow-lg backdrop-blur transition-all border text-[11px] {
            currentSelectedReviewCommentId === c.id
              ? 'bg-indigo-500 text-white border-indigo-500 ring-2 ring-indigo-300 scale-105'
              : 'bg-white/95 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
          }"
        >
          <div class="flex items-center gap-1 mb-0.5">
            <span
              class="text-[9px] font-bold px-1 rounded flex-shrink-0"
              style={{
                backgroundColor: REVIEW_PRIORITY_BADGE[c.priority] || '#9CA3AF',
                color: 'white'
              }}
            >
              #{c.commentNumber}
            </span>
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {c.userColor}"></span>
            <span class="font-medium truncate flex-1">{c.userName}</span>
            <span
              class="text-[9px] px-1 rounded border flex-shrink-0"
              style={currentSelectedReviewCommentId === c.id
                ? 'border-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.9)'
                : REVIEW_STATUS_COLORS[c.status]
              }
            >
              {REVIEW_STATUS_LABELS[c.status]}
            </span>
          </div>
          <div class="truncate {currentSelectedReviewCommentId === c.id ? 'text-white/90' : 'text-gray-600'}">
            {c.content}
          </div>
          {#if currentSelectedReviewCommentId === c.id}
            <div class="mt-1 pt-1 border-t border-white/20 flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  style={{
                    width: c.status === 'closed' ? '100%'
                      : c.status === 'verified' ? '85%'
                      : c.status === 'resolved' ? '70%'
                      : c.status === 'in_progress' ? '40%'
                      : c.status === 'rejected' ? '100%'
                      : '10%',
                    backgroundColor: c.status === 'rejected' ? '#9CA3AF' : '#86EFAC'
                  }}
                />
              </div>
              <span class="text-[9px] opacity-80">闭环进度</span>
            </div>
          {/if}
        </button>
      {/each}
      {#if commentsForCurrentContext().length > 5}
        <div class="text-[10px] text-center text-gray-500 bg-white/80 backdrop-blur rounded px-2 py-0.5">
          还有 {commentsForCurrentContext().length - 5} 条
        </div>
      {/if}
    </div>
  {/if}

  {#if activeComment()}
    <div class="absolute bottom-2 left-2 right-2 z-10 bg-white/98 backdrop-blur rounded-lg shadow-xl border border-indigo-200 p-2.5 max-w-[440px]">
      {#each [activeComment()!] as c}
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
              style="background-color: {REVIEW_PRIORITY_BADGE[c.priority] || '#9CA3AF'}"
            >
              #{c.commentNumber} · {REVIEW_PRIORITY_LABELS[c.priority] ?? c.priority}
            </span>
            <span
              class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
              style="background-color: {c.userColor}"
            >
              {c.userName.substring(0, 1)}
            </span>
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-medium text-gray-800 truncate">{c.userName}</span>
              <span class="text-[9px] text-gray-500 truncate">
                {REVIEW_USER_ROLE_LABELS[c.userRole] ?? c.userRole}
                {#if c.category}
                  · {c.category}
                {/if}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span class="text-[10px] px-1.5 py-0.5 rounded border {REVIEW_STATUS_COLORS[c.status]}">
              {REVIEW_STATUS_LABELS[c.status]}
            </span>
            <button
              type="button"
              onclick={() => setSelectedReviewComment(null)}
              class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="mb-2">
          <div class="text-xs text-gray-700 mb-1.5 leading-relaxed">{c.content}</div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              style={{
                width: c.status === 'closed' ? '100%'
                  : c.status === 'verified' ? '85%'
                  : c.status === 'resolved' ? '70%'
                  : c.status === 'in_progress' ? '40%'
                  : c.status === 'rejected' ? '100%'
                  : '10%',
                backgroundColor: c.status === 'rejected' ? '#9CA3AF'
                  : c.status === 'closed' || c.status === 'verified' ? '#10B981'
                  : '#6366F1'
              }}
            />
          </div>
          <div class="flex justify-between mt-0.5 text-[9px] text-gray-400">
            <span>待处理</span>
            <span>处理中</span>
            <span>已解决</span>
            <span>已验证</span>
            <span>已关闭</span>
          </div>
        </div>

        {#if c.selection.targetType !== 'general'}
          <div class="text-[10px] text-gray-500 mb-1.5 flex items-center gap-1 flex-wrap">
            <span class="px-1 py-0.5 bg-gray-100 rounded">圈选对象：</span>
            {#if c.selection.nodeIds && c.selection.nodeIds.length > 0}
              {#each c.selection.nodeIds.slice(0, 3) as nid}
                <span class="px-1 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100">
                  📍 {currentNodes.get(nid)?.label || nid.substring(0, 6)}
                </span>
              {/each}
              {#if (c.selection.nodeIds?.length || 0) > 3}
                <span class="text-gray-400">+{(c.selection.nodeIds?.length || 0) - 3}</span>
              {/if}
            {/if}
            {#if c.selection.ropeIds && c.selection.ropeIds.length > 0}
              {#each c.selection.ropeIds.slice(0, 2) as rid}
                <span class="px-1 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-100">
                  〰 {currentRopes.get(rid)?.label || rid.substring(0, 6)}
                </span>
              {/each}
              {#if (c.selection.ropeIds?.length || 0) > 2}
                <span class="text-gray-400">+{(c.selection.ropeIds?.length || 0) - 2}</span>
              {/if}
            {/if}
          </div>
        {/if}

        {#if c.resolvedVersionId}
          <div class="text-[10px] text-green-700 bg-green-50 rounded px-1.5 py-0.5 mb-1.5 border border-green-200">
            ✓ 于 v{currentVersions.find(v => v.id === c.resolvedVersionId)?.versionNumber || '?'} 版本中解决
            {#if c.resolveNote}
              ：{c.resolveNote}
            {/if}
          </div>
        {/if}

        <div class="flex items-center justify-between text-[9px] text-gray-400">
          <span>创建：{c.createdAt.substring(0, 16).replace('T', ' ')}</span>
          {#if c.verifiedAt}
            <span>验证：{c.verifiedAt.substring(0, 16).replace('T', ' ')} · {c.verifiedByName || ''}</span>
          {/if}
          {#if c.closure}
            <span>关闭：{c.closure.closedAt.substring(0, 16).replace('T', ' ')} · {c.closure.closedByName}</span>
          {/if}
        </div>

        <div class="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
          {#if c.status === 'pending'}
            <button
              type="button"
              onclick={() => {
                const note = prompt('请输入处理说明（可选）：');
                if (note !== null) store.updateReviewCommentStatus(c.id, 'in_progress', note || '开始处理此问题');
              }}
              class="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200"
            >
              → 开始处理
            </button>
          {/if}
          {#if c.status === 'in_progress'}
            <button
              type="button"
              onclick={() => {
                const note = prompt('请输入解决说明：');
                if (note !== null) store.updateReviewCommentStatus(c.id, 'resolved', note || '问题已解决');
              }}
              class="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
            >
              ✓ 标记解决
            </button>
          {/if}
          {#if c.status === 'resolved'}
            <button
              type="button"
              onclick={() => {
                const note = prompt('验证确认（可选）：');
                if (note !== null) store.verifyReviewComment(c.id, note);
              }}
              class="text-[10px] px-2 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-300 hover:bg-teal-200"
            >
              ✓✓ 验证通过
            </button>
          {/if}
          {#if c.status === 'resolved' || c.status === 'verified'}
            <button
              type="button"
              onclick={() => {
                const note = prompt('归档说明（可选）：');
                if (note !== null) store.closeReviewComment(c.id, note || '问题已闭环，归档');
              }}
              class="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-400 hover:bg-slate-300"
            >
              🔒 关闭归档
            </button>
          {/if}
          {#if c.status !== 'closed' && c.status !== 'pending' && c.status !== 'rejected'}
            <button
              type="button"
              onclick={() => {
                const note = prompt('重新打开说明（可选）：');
                if (note !== null) store.reopenReviewComment(c.id, note);
              }}
              class="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200"
            >
              ↺ 重新打开
            </button>
          {/if}
          {#if diff}
            <button
              type="button"
              onclick={() => {
                const { fromVersion, toVersion } = store.getVersionDiffForComment(c.id);
                if (fromVersion && toVersion) {
                  store.setCompareVersionA(fromVersion.id);
                  store.setCompareVersionB(toVersion.id);
                  store.setDiffFilterCommentId(c.id);
                  setSelectedReviewComment(null);
                } else {
                  alert('无法确定此批注对应的版本对比范围');
                }
              }}
              class="text-[10px] px-2 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-300 hover:bg-sky-200 ml-auto"
            >
              🔍 查看解决此问题的变更
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
