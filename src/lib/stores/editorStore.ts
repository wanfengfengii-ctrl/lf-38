import { writable, derived, get } from 'svelte/store';
import type {
  RopeNode,
  RopeData,
  EditorMode,
  ValidationError,
  NodeType,
  PulleyDirection,
  RopePath,
  Position,
  MastNode,
  PulleyNode,
  MooringNode,
  PathChainNode,
  PathChainOffset
} from '$lib/types';
import {
  generateId,
  NODE_TYPE_LABELS,
  ROPE_COLORS,
  DEFAULT_ROPE_COLOR,
  createDefaultPathChainNode,
  NODE_RADIUS
} from '$lib/types';
import {
  validateAll,
  validateAllPaths,
  canSave,
  calculateTotalRopeLength,
  validateRopePath,
  recalculateRopeLengths
} from '$lib/utils/pathValidator';

function createEditorStore() {
  const nodes = writable<Map<string, RopeNode>>(new Map());
  const ropes = writable<Map<string, RopeData>>(new Map());
  const selectedNodeId = writable<string | null>(null);
  const selectedRopeId = writable<string | null>(null);
  const selectedPathNodeIndex = writable<number | null>(null);
  const mode = writable<EditorMode>('select');
  const addingNodeType = writable<NodeType>('mast');
  const nextNodeNumber = writable<number>(1);
  const ropeBuildingPath = writable<string[]>([]);
  const isDirty = writable<boolean>(false);
  const lastSavedAt = writable<string | null>(null);

  const validationErrors = derived<
    [typeof nodes, typeof ropes],
    ValidationError[]
  >([nodes, ropes], ([$nodes, $ropes]) => {
    return validateAll($nodes, $ropes);
  });

  const ropePaths = derived<[typeof nodes, typeof ropes], Map<string, RopePath>>(
    [nodes, ropes],
    ([$nodes, $ropes]) => {
      return validateAllPaths($nodes, $ropes);
    }
  );

  const totalRopeLength = derived<[typeof nodes, typeof ropes], number>(
    [nodes, ropes],
    ([$nodes, $ropes]) => {
      return calculateTotalRopeLength($nodes, $ropes);
    }
  );

  const canSaveScheme = derived<[typeof nodes, typeof ropes], boolean>(
    [nodes, ropes],
    ([$nodes, $ropes]) => {
      return canSave($nodes, $ropes);
    }
  );

  const hasErrors = derived([validationErrors], ([$errors]) => {
    return $errors.filter(e => e.severity === 'error').length > 0;
  });

  function markDirty() {
    isDirty.set(true);
  }

  function getNextNodeNumber(): number {
    const $nodes = get(nodes);
    const usedNumbers = new Set<number>();
    for (const [, node] of $nodes) {
      usedNumbers.add(node.number);
    }
    let num = 1;
    while (usedNumbers.has(num)) {
      num++;
    }
    return num;
  }

  function isNodeNumberAvailable(num: number, excludeId?: string): boolean {
    const $nodes = get(nodes);
    for (const [id, node] of $nodes) {
      if (excludeId && id === excludeId) continue;
      if (node.number === num) return false;
    }
    return true;
  }

  function addNode(type: NodeType, position: Position): RopeNode | null {
    const number = getNextNodeNumber();
    const id = generateId();
    const label = `${NODE_TYPE_LABELS[type]} ${number}`;

    let node: RopeNode;

    switch (type) {
      case 'mast':
        node = {
          id,
          type: 'mast',
          label,
          number,
          position,
          description: '',
          height: 10
        } as MastNode;
        break;
      case 'pulley':
        node = {
          id,
          type: 'pulley',
          label,
          number,
          position,
          description: '',
          direction: 'bidirectional',
          active: true,
          sheaveCount: 1
        } as PulleyNode;
        break;
      case 'mooring':
        node = {
          id,
          type: 'mooring',
          label,
          number,
          position,
          description: '',
          loadCapacity: 1000
        } as MooringNode;
        break;
      default:
        return null;
    }

    nodes.update(($nodes) => {
      $nodes.set(id, node);
      return new Map($nodes);
    });

    nextNodeNumber.set(number + 1);
    markDirty();
    return node;
  }

  function updateNode(id: string, updates: Partial<RopeNode>) {
    nodes.update(($nodes) => {
      const node = $nodes.get(id);
      if (node) {
        if (updates.number !== undefined && updates.number !== node.number) {
          if (!isNodeNumberAvailable(updates.number, id)) {
            return $nodes;
          }
        }
        $nodes.set(id, { ...node, ...updates } as RopeNode);
      }
      return new Map($nodes);
    });
    refreshAllRopeLengths();
    markDirty();
  }

  function deleteNode(id: string) {
    ropes.update(($ropes) => {
      const toDelete: string[] = [];
      for (const [ropeId, rope] of $ropes) {
        const hasNode = rope.nodePath.some(cn => cn.nodeId === id);
        if (hasNode) {
          toDelete.push(ropeId);
        }
      }
      for (const ropeId of toDelete) {
        $ropes.delete(ropeId);
      }
      return new Map($ropes);
    });

    nodes.update(($nodes) => {
      $nodes.delete(id);
      return new Map($nodes);
    });

    selectedNodeId.set(null);
    ropeBuildingPath.set([]);
    markDirty();
  }

  function moveNode(id: string, position: Position) {
    nodes.update(($nodes) => {
      const node = $nodes.get(id);
      if (node) {
        $nodes.set(id, { ...node, position });
      }
      return new Map($nodes);
    });
    refreshAllRopeLengths();
    markDirty();
  }

  function getRopeColor(index: number): string {
    return ROPE_COLORS[index % ROPE_COLORS.length] || DEFAULT_ROPE_COLOR;
  }

  function createRopeFromPath(nodeIds: string[]): RopeData | null {
    const $nodes = get(nodes);
    const $ropes = get(ropes);

    if (nodeIds.length < 2) return null;

    const nodePath: PathChainNode[] = nodeIds.map(nid => createDefaultPathChainNode(nid));

    const tempRope: RopeData = {
      id: generateId(),
      label: `缆绳 ${$ropes.size + 1}`,
      nodePath,
      tension: 100,
      totalLength: 0,
      segmentLengths: [],
      color: getRopeColor($ropes.size),
      description: ''
    };

    const path = validateRopePath(tempRope, $nodes, $ropes);
    tempRope.totalLength = path.totalLength;
    tempRope.segmentLengths = path.segments.map(s => s.length);

    ropes.update(($r) => {
      $r.set(tempRope.id, tempRope);
      return new Map($r);
    });

    markDirty();
    return tempRope;
  }

  function startBuildingRope(startNodeId: string) {
    ropeBuildingPath.set([startNodeId]);
    mode.set('addRope');
  }

  function addNodeToBuildingPath(nodeId: string): boolean {
    const currentPath = get(ropeBuildingPath);
    if (currentPath.length === 0) return false;
    if (currentPath[currentPath.length - 1] === nodeId) return false;

    const $nodes = get(nodes);
    const node = $nodes.get(nodeId);
    if (!node) return false;

    ropeBuildingPath.set([...currentPath, nodeId]);
    return true;
  }

  function finishBuildingRope(): RopeData | null {
    const path = get(ropeBuildingPath);
    if (path.length < 2) {
      cancelBuildingRope();
      return null;
    }
    const rope = createRopeFromPath(path);
    cancelBuildingRope();
    return rope;
  }

  function cancelBuildingRope() {
    ropeBuildingPath.set([]);
    mode.set('select');
  }

  function addRopeNode(ropeId: string, nodeId: string, insertIndex?: number) {
    const $nodes = get(nodes);
    const node = $nodes.get(nodeId);
    if (!node) return;

    ropes.update(($ropes) => {
      const rope = $ropes.get(ropeId);
      if (!rope) return $ropes;

      const alreadyExists = rope.nodePath.some(cn => cn.nodeId === nodeId);
      if (alreadyExists) return $ropes;

      const newChainNode = createDefaultPathChainNode(nodeId);
      const newNodePath = [...rope.nodePath];

      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < newNodePath.length) {
        newNodePath.splice(insertIndex, 0, newChainNode);
      } else {
        newNodePath.push(newChainNode);
      }

      const updatedRope = { ...rope, nodePath: newNodePath };
      const recalc = recalculateRopeLengths(updatedRope, $nodes);
      updatedRope.totalLength = recalc.totalLength;
      updatedRope.segmentLengths = recalc.segmentLengths;

      $ropes.set(ropeId, updatedRope);
      return new Map($ropes);
    });
    markDirty();
  }

  function removeRopeNode(ropeId: string, pathIndex: number) {
    ropes.update(($ropes) => {
      const rope = $ropes.get(ropeId);
      if (!rope) return $ropes;
      if (rope.nodePath.length <= 2) return $ropes;
      if (pathIndex < 0 || pathIndex >= rope.nodePath.length) return $ropes;

      const newNodePath = rope.nodePath.filter((_, i) => i !== pathIndex);
      const updatedRope = { ...rope, nodePath: newNodePath };
      const recalc = recalculateRopeLengths(updatedRope, get(nodes));
      updatedRope.totalLength = recalc.totalLength;
      updatedRope.segmentLengths = recalc.segmentLengths;

      $ropes.set(ropeId, updatedRope);
      return new Map($ropes);
    });
    markDirty();
  }

  function reorderRopeNode(ropeId: string, fromIndex: number, toIndex: number) {
    ropes.update(($ropes) => {
      const rope = $ropes.get(ropeId);
      if (!rope) return $ropes;
      if (fromIndex < 0 || fromIndex >= rope.nodePath.length) return $ropes;
      if (toIndex < 0 || toIndex >= rope.nodePath.length) return $ropes;
      if (fromIndex === toIndex) return $ropes;

      const newNodePath = [...rope.nodePath];
      const [removed] = newNodePath.splice(fromIndex, 1);
      newNodePath.splice(toIndex, 0, removed);

      const updatedRope = { ...rope, nodePath: newNodePath };
      const recalc = recalculateRopeLengths(updatedRope, get(nodes));
      updatedRope.totalLength = recalc.totalLength;
      updatedRope.segmentLengths = recalc.segmentLengths;

      $ropes.set(ropeId, updatedRope);
      return new Map($ropes);
    });
    markDirty();
  }

  function updatePathChainNode(
    ropeId: string,
    pathIndex: number,
    updates: Partial<PathChainNode>
  ) {
    ropes.update(($ropes) => {
      const rope = $ropes.get(ropeId);
      if (!rope) return $ropes;
      if (pathIndex < 0 || pathIndex >= rope.nodePath.length) return $ropes;

      const newNodePath = rope.nodePath.map((cn, i) =>
        i === pathIndex ? { ...cn, ...updates } : cn
      );

      const updatedRope = { ...rope, nodePath: newNodePath };
      const recalc = recalculateRopeLengths(updatedRope, get(nodes));
      updatedRope.totalLength = recalc.totalLength;
      updatedRope.segmentLengths = recalc.segmentLengths;

      $ropes.set(ropeId, updatedRope);
      return new Map($ropes);
    });
    markDirty();
  }

  function updatePathNodeOffset(
    ropeId: string,
    pathIndex: number,
    isExit: boolean,
    offset: PathChainOffset
  ) {
    ropes.update(($ropes) => {
      const rope = $ropes.get(ropeId);
      if (!rope) return $ropes;
      if (pathIndex < 0 || pathIndex >= rope.nodePath.length) return $ropes;

      const chainNode = rope.nodePath[pathIndex];
      const newChainNode = {
        ...chainNode,
        ...(isExit ? { exitOffset: offset } : { entryOffset: offset })
      };

      const newNodePath = rope.nodePath.map((cn, i) =>
        i === pathIndex ? newChainNode : cn
      );

      const updatedRope = { ...rope, nodePath: newNodePath };
      const recalc = recalculateRopeLengths(updatedRope, get(nodes));
      updatedRope.totalLength = recalc.totalLength;
      updatedRope.segmentLengths = recalc.segmentLengths;

      $ropes.set(ropeId, updatedRope);
      return new Map($ropes);
    });
    markDirty();
  }

  function updateRope(id: string, updates: Partial<RopeData>) {
    ropes.update(($ropes) => {
      const rope = $ropes.get(id);
      if (rope) {
        $ropes.set(id, { ...rope, ...updates });
      }
      return new Map($ropes);
    });
    markDirty();
  }

  function deleteRope(id: string) {
    ropes.update(($ropes) => {
      $ropes.delete(id);
      return new Map($ropes);
    });
    selectedRopeId.set(null);
    selectedPathNodeIndex.set(null);
    markDirty();
  }

  function refreshAllRopeLengths() {
    const $nodes = get(nodes);
    ropes.update(($ropes) => {
      for (const [id, rope] of $ropes) {
        const recalc = recalculateRopeLengths(rope, $nodes);
        $ropes.set(id, {
          ...rope,
          totalLength: recalc.totalLength,
          segmentLengths: recalc.segmentLengths
        });
      }
      return new Map($ropes);
    });
  }

  function setMode(newMode: EditorMode) {
    mode.set(newMode);
    if (newMode !== 'addRope') {
      ropeBuildingPath.set([]);
    }
    if (newMode !== 'select' && newMode !== 'edit' && newMode !== 'extendPath') {
      selectedPathNodeIndex.set(null);
    }
  }

  function selectNode(id: string | null) {
    selectedNodeId.set(id);
    selectedRopeId.set(null);
    selectedPathNodeIndex.set(null);
  }

  function selectRope(id: string | null) {
    selectedRopeId.set(id);
    selectedNodeId.set(null);
    selectedPathNodeIndex.set(null);
  }

  function selectPathNodeIndex(index: number | null) {
    selectedPathNodeIndex.set(index);
  }

  function clearSelection() {
    selectedNodeId.set(null);
    selectedRopeId.set(null);
    selectedPathNodeIndex.set(null);
    ropeBuildingPath.set([]);
  }

  function clearAll() {
    nodes.set(new Map());
    ropes.set(new Map());
    selectedNodeId.set(null);
    selectedRopeId.set(null);
    selectedPathNodeIndex.set(null);
    nextNodeNumber.set(1);
    ropeBuildingPath.set([]);
    isDirty.set(false);
    lastSavedAt.set(null);
  }

  function exportScheme(): string {
    const $nodes = get(nodes);
    const $ropes = get(ropes);
    const data = {
      nodes: Array.from($nodes.values()),
      ropes: Array.from($ropes.values()),
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }

  function importScheme(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (!data.nodes || !data.ropes) return false;

      const newNodes = new Map<string, RopeNode>();
      for (const node of data.nodes) {
        newNodes.set(node.id, node);
      }

      const newRopes = new Map<string, RopeData>();
      for (const rope of data.ropes) {
        if (!rope.nodePath) {
          if (rope.source && rope.target) {
            rope.nodePath = [
              createDefaultPathChainNode(rope.source),
              createDefaultPathChainNode(rope.target)
            ];
          } else {
            continue;
          }
        }
        if (rope.totalLength === undefined) rope.totalLength = 0;
        if (rope.segmentLengths === undefined) rope.segmentLengths = [];
        newRopes.set(rope.id, rope);
      }

      if (!canSave(newNodes, newRopes)) {
        return false;
      }

      nodes.set(newNodes);
      ropes.set(newRopes);
      clearSelection();
      nextNodeNumber.set(getNextNodeNumber());
      isDirty.set(false);
      return true;
    } catch {
      return false;
    }
  }

  const STORAGE_KEY = 'rope-editor-scheme';

  function saveToLocalStorage(): boolean {
    if (!canSave(get(nodes), get(ropes))) {
      return false;
    }
    try {
      const data = {
        nodes: Array.from(get(nodes).values()),
        ropes: Array.from(get(ropes).values()),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      isDirty.set(false);
      lastSavedAt.set(data.savedAt);
      return true;
    } catch {
      return false;
    }
  }

  function loadFromLocalStorage(): boolean {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return false;
      const data = JSON.parse(json);
      lastSavedAt.set(data.savedAt || null);
      return importScheme(json);
    } catch {
      return false;
    }
  }

  function hasSavedScheme(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function clearSavedScheme(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      lastSavedAt.set(null);
    } catch {
      // ignore
    }
  }

  function togglePulleyActive(id: string) {
    nodes.update(($nodes) => {
      const node = $nodes.get(id);
      if (node && node.type === 'pulley') {
        $nodes.set(id, { ...node, active: !node.active });
      }
      return new Map($nodes);
    });
    refreshAllRopeLengths();
    markDirty();
  }

  function setPulleyDirection(id: string, direction: PulleyDirection) {
    nodes.update(($nodes) => {
      const node = $nodes.get(id);
      if (node && node.type === 'pulley') {
        $nodes.set(id, { ...node, direction });
      }
      return new Map($nodes);
    });
    refreshAllRopeLengths();
    markDirty();
  }

  function loadDemoData() {
    clearAll();

    const demoNodes: RopeNode[] = [
      {
        id: 'demo-mast-1',
        type: 'mast',
        label: '主桅杆 1',
        number: 1,
        position: { x: 400, y: 150 },
        description: '前桅',
        height: 15
      } as MastNode,
      {
        id: 'demo-mast-2',
        type: 'mast',
        label: '主桅杆 2',
        number: 2,
        position: { x: 600, y: 150 },
        description: '主桅',
        height: 20
      } as MastNode,
      {
        id: 'demo-pulley-1',
        type: 'pulley',
        label: '滑轮 A',
        number: 3,
        position: { x: 300, y: 300 },
        description: '前桅滑车',
        direction: 'clockwise',
        active: true,
        sheaveCount: 2
      } as PulleyNode,
      {
        id: 'demo-pulley-2',
        type: 'pulley',
        label: '滑轮 B',
        number: 4,
        position: { x: 500, y: 350 },
        description: '主桅滑车',
        direction: 'counterclockwise',
        active: true,
        sheaveCount: 3
      } as PulleyNode,
      {
        id: 'demo-pulley-3',
        type: 'pulley',
        label: '滑轮 C',
        number: 5,
        position: { x: 700, y: 300 },
        description: '后桅滑车（备用）',
        direction: 'bidirectional',
        active: false,
        sheaveCount: 1
      } as PulleyNode,
      {
        id: 'demo-mooring-1',
        type: 'mooring',
        label: '系索点 1',
        number: 6,
        position: { x: 200, y: 500 },
        description: '左舷系缆桩',
        loadCapacity: 5000
      } as MooringNode,
      {
        id: 'demo-mooring-2',
        type: 'mooring',
        label: '系索点 2',
        number: 7,
        position: { x: 600, y: 500 },
        description: '右舷系缆桩',
        loadCapacity: 5000
      } as MooringNode
    ];

    const newNodes = new Map<string, RopeNode>();
    for (const node of demoNodes) {
      newNodes.set(node.id, node);
    }
    nodes.set(newNodes);

    const demoRopes: RopeData[] = [
      {
        id: 'demo-rope-1',
        label: '主帆穿绕索',
        nodePath: [
          { nodeId: 'demo-mooring-1', entryOffset: { dx: 0, dy: 0 }, exitOffset: { dx: 0, dy: -NODE_RADIUS } },
          { nodeId: 'demo-pulley-1', entryOffset: { dx: -NODE_RADIUS * 0.6, dy: NODE_RADIUS * 0.3 }, exitOffset: { dx: NODE_RADIUS * 0.6, dy: -NODE_RADIUS * 0.3 } },
          { nodeId: 'demo-mast-1', entryOffset: { dx: 0, dy: NODE_RADIUS }, exitOffset: { dx: NODE_RADIUS * 0.5, dy: 0 } },
          { nodeId: 'demo-mast-2', entryOffset: { dx: -NODE_RADIUS * 0.5, dy: 0 }, exitOffset: { dx: 0, dy: NODE_RADIUS } },
          { nodeId: 'demo-pulley-2', entryOffset: { dx: 0, dy: -NODE_RADIUS }, exitOffset: { dx: NODE_RADIUS * 0.6, dy: NODE_RADIUS * 0.3 } },
          { nodeId: 'demo-mooring-2', entryOffset: { dx: -NODE_RADIUS * 0.5, dy: -NODE_RADIUS * 0.3 }, exitOffset: { dx: 0, dy: 0 } }
        ],
        tension: 500,
        totalLength: 0,
        segmentLengths: [],
        color: '#CD853F',
        description: '完整的穿绕路径：左舷系缆桩 → 滑轮A → 主桅杆1 → 主桅杆2 → 滑轮B → 右舷系缆桩'
      }
    ];

    const newRopes = new Map<string, RopeData>();
    const $nodesVal = newNodes;
    for (const rope of demoRopes) {
      const recalc = recalculateRopeLengths(rope, $nodesVal);
      rope.totalLength = recalc.totalLength;
      rope.segmentLengths = recalc.segmentLengths;
      newRopes.set(rope.id, rope);
    }
    ropes.set(newRopes);

    nextNodeNumber.set(8);
    isDirty.set(false);
  }

  return {
    nodes,
    ropes,
    selectedNodeId,
    selectedRopeId,
    selectedPathNodeIndex,
    mode,
    addingNodeType,
    nextNodeNumber,
    ropeBuildingPath,
    isDirty,
    lastSavedAt,
    validationErrors,
    ropePaths,
    totalRopeLength,
    canSaveScheme,
    hasErrors,
    addNode,
    updateNode,
    deleteNode,
    moveNode,
    createRopeFromPath,
    startBuildingRope,
    addNodeToBuildingPath,
    finishBuildingRope,
    cancelBuildingRope,
    addRopeNode,
    removeRopeNode,
    reorderRopeNode,
    updatePathChainNode,
    updatePathNodeOffset,
    updateRope,
    deleteRope,
    refreshAllRopeLengths,
    setMode,
    selectNode,
    selectRope,
    selectPathNodeIndex,
    clearSelection,
    clearAll,
    exportScheme,
    importScheme,
    togglePulleyActive,
    setPulleyDirection,
    loadDemoData,
    isNodeNumberAvailable,
    saveToLocalStorage,
    loadFromLocalStorage,
    hasSavedScheme,
    clearSavedScheme
  };
}

export const editorStore = createEditorStore();
