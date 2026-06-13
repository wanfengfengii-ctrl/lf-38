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
  MooringNode
} from '$lib/types';
import {
  generateId,
  NODE_TYPE_LABELS,
  ROPE_COLORS,
  DEFAULT_ROPE_COLOR,
  calculateDistance
} from '$lib/types';
import {
  validateAll,
  validateAllPaths,
  canSave,
  calculateTotalRopeLength,
  validateRopePath
} from '$lib/utils/pathValidator';

function createEditorStore() {
  const nodes = writable<Map<string, RopeNode>>(new Map());
  const ropes = writable<Map<string, RopeData>>(new Map());
  const selectedNodeId = writable<string | null>(null);
  const selectedRopeId = writable<string | null>(null);
  const mode = writable<EditorMode>('select');
  const addingNodeType = writable<NodeType>('mast');
  const nextNodeNumber = writable<number>(1);
  const ropeSourceId = writable<string | null>(null);

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
    refreshRopeLengths();
  }

  function deleteNode(id: string) {
    ropes.update(($ropes) => {
      const toDelete: string[] = [];
      for (const [ropeId, rope] of $ropes) {
        if (rope.source === id || rope.target === id) {
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
    ropeSourceId.set(null);
  }

  function moveNode(id: string, position: Position) {
    nodes.update(($nodes) => {
      const node = $nodes.get(id);
      if (node) {
        $nodes.set(id, { ...node, position });
      }
      return new Map($nodes);
    });
    refreshRopeLengths();
  }

  function getRopeColor(index: number): string {
    return ROPE_COLORS[index % ROPE_COLORS.length] || DEFAULT_ROPE_COLOR;
  }

  function addRope(sourceId: string, targetId: string): RopeData | null {
    const $nodes = get(nodes);
    const $ropes = get(ropes);

    const sourceNode = $nodes.get(sourceId);
    const targetNode = $nodes.get(targetId);

    if (!sourceNode || !targetNode) return null;
    if (sourceId === targetId) return null;

    const length = calculateDistance(sourceNode.position, targetNode.position);

    const rope: RopeData = {
      id: generateId(),
      label: `缆绳 ${$ropes.size + 1}`,
      source: sourceId,
      target: targetId,
      tension: 100,
      length,
      color: getRopeColor($ropes.size),
      description: ''
    };

    const path = validateRopePath(rope, $nodes, $ropes);
    if (!path.isValid) {
      return null;
    }

    ropes.update(($r) => {
      $r.set(rope.id, rope);
      return new Map($r);
    });

    return rope;
  }

  function updateRope(id: string, updates: Partial<RopeData>) {
    ropes.update(($ropes) => {
      const rope = $ropes.get(id);
      if (rope) {
        $ropes.set(id, { ...rope, ...updates });
      }
      return new Map($ropes);
    });
  }

  function deleteRope(id: string) {
    ropes.update(($ropes) => {
      $ropes.delete(id);
      return new Map($ropes);
    });
    selectedRopeId.set(null);
  }

  function refreshRopeLengths() {
    const $nodes = get(nodes);
    ropes.update(($ropes) => {
      for (const [id, rope] of $ropes) {
        const sourceNode = $nodes.get(rope.source);
        const targetNode = $nodes.get(rope.target);
        if (sourceNode && targetNode) {
          const length = calculateDistance(sourceNode.position, targetNode.position);
          $ropes.set(id, { ...rope, length });
        }
      }
      return new Map($ropes);
    });
  }

  function setMode(newMode: EditorMode) {
    mode.set(newMode);
    if (newMode !== 'addRope') {
      ropeSourceId.set(null);
    }
  }

  function selectNode(id: string | null) {
    selectedNodeId.set(id);
    selectedRopeId.set(null);
  }

  function selectRope(id: string | null) {
    selectedRopeId.set(id);
    selectedNodeId.set(null);
  }

  function clearSelection() {
    selectedNodeId.set(null);
    selectedRopeId.set(null);
    ropeSourceId.set(null);
  }

  function startRopeFromNode(nodeId: string) {
    ropeSourceId.set(nodeId);
    mode.set('addRope');
  }

  function completeRope(targetId: string): RopeData | null {
    const sourceId = get(ropeSourceId);
    if (!sourceId) return null;

    const result = addRope(sourceId, targetId);
    ropeSourceId.set(null);
    mode.set('select');
    return result;
  }

  function clearAll() {
    nodes.set(new Map());
    ropes.set(new Map());
    selectedNodeId.set(null);
    selectedRopeId.set(null);
    nextNodeNumber.set(1);
    ropeSourceId.set(null);
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
        newRopes.set(rope.id, rope);
      }

      if (!canSave(newNodes, newRopes)) {
        return false;
      }

      nodes.set(newNodes);
      ropes.set(newRopes);
      clearSelection();
      nextNodeNumber.set(getNextNodeNumber());
      return true;
    } catch {
      return false;
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
  }

  function setPulleyDirection(id: string, direction: PulleyDirection) {
    nodes.update(($nodes) => {
      const node = $nodes.get(id);
      if (node && node.type === 'pulley') {
        $nodes.set(id, { ...node, direction });
      }
      return new Map($nodes);
    });
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
        label: '主帆索',
        source: 'demo-mooring-1',
        target: 'demo-pulley-1',
        tension: 500,
        length: calculateDistance(
          { x: 200, y: 500 },
          { x: 300, y: 300 }
        ),
        color: '#CD853F',
        description: '连接左舷系缆桩到前桅滑车'
      },
      {
        id: 'demo-rope-2',
        label: '连接索 A',
        source: 'demo-pulley-1',
        target: 'demo-mast-1',
        tension: 300,
        length: calculateDistance(
          { x: 300, y: 300 },
          { x: 400, y: 150 }
        ),
        color: '#4682B4',
        description: '前桅滑车到前桅'
      },
      {
        id: 'demo-rope-3',
        label: '横桁索',
        source: 'demo-mast-1',
        target: 'demo-mast-2',
        tension: 400,
        length: calculateDistance(
          { x: 400, y: 150 },
          { x: 600, y: 150 }
        ),
        color: '#9932CC',
        description: '两桅之间的横拉索'
      },
      {
        id: 'demo-rope-4',
        label: '连接索 B',
        source: 'demo-mast-2',
        target: 'demo-pulley-2',
        tension: 350,
        length: calculateDistance(
          { x: 600, y: 150 },
          { x: 500, y: 350 }
        ),
        color: '#228B22',
        description: '主桅到主桅滑车'
      },
      {
        id: 'demo-rope-5',
        label: '副帆索',
        source: 'demo-pulley-2',
        target: 'demo-mooring-2',
        tension: 450,
        length: calculateDistance(
          { x: 500, y: 350 },
          { x: 600, y: 500 }
        ),
        color: '#DC143C',
        description: '主桅滑车到右舷系缆桩'
      }
    ];

    const newRopes = new Map<string, RopeData>();
    for (const rope of demoRopes) {
      newRopes.set(rope.id, rope);
    }
    ropes.set(newRopes);

    nextNodeNumber.set(8);
  }

  return {
    nodes,
    ropes,
    selectedNodeId,
    selectedRopeId,
    mode,
    addingNodeType,
    nextNodeNumber,
    ropeSourceId,
    validationErrors,
    ropePaths,
    totalRopeLength,
    canSaveScheme,
    hasErrors,
    addNode,
    updateNode,
    deleteNode,
    moveNode,
    addRope,
    updateRope,
    deleteRope,
    refreshRopeLengths,
    setMode,
    selectNode,
    selectRope,
    clearSelection,
    startRopeFromNode,
    completeRope,
    clearAll,
    exportScheme,
    importScheme,
    togglePulleyActive,
    setPulleyDirection,
    loadDemoData,
    isNodeNumberAvailable
  };
}

export const editorStore = createEditorStore();
