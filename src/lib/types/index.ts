export type NodeType = 'mast' | 'pulley' | 'mooring';

export type PulleyDirection = 'clockwise' | 'counterclockwise' | 'bidirectional';

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  id: string;
  label: string;
  type: NodeType;
  position: Position;
  number: number;
  description?: string;
}

export interface MastNode extends NodeData {
  type: 'mast';
  height?: number;
}

export interface PulleyNode extends NodeData {
  type: 'pulley';
  direction: PulleyDirection;
  active: boolean;
  sheaveCount?: number;
}

export interface MooringNode extends NodeData {
  type: 'mooring';
  loadCapacity?: number;
}

export type RopeNode = MastNode | PulleyNode | MooringNode;

export interface PathChainOffset {
  dx: number;
  dy: number;
}

export interface PathChainNode {
  nodeId: string;
  entryOffset: PathChainOffset;
  exitOffset: PathChainOffset;
  entryAngle?: number;
  exitAngle?: number;
}

export interface RopeData {
  id: string;
  label: string;
  nodePath: PathChainNode[];
  tension: number;
  totalLength: number;
  segmentLengths: number[];
  color?: string;
  description?: string;
}

export interface PathSegment {
  fromNode: string;
  toNode: string;
  fromPosition: Position;
  toPosition: Position;
  fromExitOffset: PathChainOffset;
  toEntryOffset: PathChainOffset;
  length: number;
  valid: boolean;
  error?: string;
  segmentIndex: number;
}

export interface RopePath {
  ropeId: string;
  nodeOrder: string[];
  segments: PathSegment[];
  totalLength: number;
  isValid: boolean;
  isContinuous: boolean;
  continuityError?: string;
  errors: string[];
  pulleyDirectionErrors: { nodeId: string; error: string }[];
  inactivePulleyErrors: { nodeId: string; error: string }[];
}

export interface EditorState {
  nodes: Map<string, RopeNode>;
  ropes: Map<string, RopeData>;
  selectedNodeId: string | null;
  selectedRopeId: string | null;
  selectedPathNodeIndex: number | null;
  nextNodeNumber: number;
  validationErrors: ValidationError[];
  isDirty: boolean;
  lastSavedAt: string | null;
}

export interface ValidationError {
  type: 'node' | 'rope' | 'path' | 'segment' | 'continuity';
  id: string;
  segmentIndex?: number;
  message: string;
  severity: 'error' | 'warning';
}

export type EditorMode = 'select' | 'addNode' | 'addRope' | 'delete' | 'edit' | 'extendPath';

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  mast: '桅杆',
  pulley: '滑轮',
  mooring: '系索点'
};

export const PULLEY_DIRECTION_LABELS: Record<PulleyDirection, string> = {
  clockwise: '顺时针',
  counterclockwise: '逆时针',
  bidirectional: '双向'
};

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  mast: '#8B4513',
  pulley: '#708090',
  mooring: '#2E8B57'
};

export const ROPE_COLORS = [
  '#CD853F',
  '#4682B4',
  '#9932CC',
  '#228B22',
  '#DC143C',
  '#FF8C00',
  '#1E90FF',
  '#8B008B'
];

export const DEFAULT_ROPE_COLOR = '#CD853F';

export const NODE_RADIUS = 25;
export const EDGE_WIDTH = 3;
export const DEFAULT_OFFSET = 0;

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function calculateDistance(p1: Position, p2: Position): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function applyOffset(position: Position, offset: PathChainOffset): Position {
  return {
    x: position.x + offset.dx,
    y: position.y + offset.dy
  };
}

export function createDefaultPathChainNode(nodeId: string): PathChainNode {
  return {
    nodeId,
    entryOffset: { dx: DEFAULT_OFFSET, dy: DEFAULT_OFFSET },
    exitOffset: { dx: DEFAULT_OFFSET, dy: DEFAULT_OFFSET }
  };
}

export function calculateAngle(from: Position, to: Position): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function calculatePulleyWrapAngle(
  entryAngle: number,
  exitAngle: number,
  pulleyDirection: PulleyDirection
): number {
  let diff = exitAngle - entryAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff);
}
