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

export interface RopeData {
  id: string;
  label: string;
  source: string;
  target: string;
  tension: number;
  length: number;
  color?: string;
  description?: string;
}

export interface PathSegment {
  fromNode: string;
  toNode: string;
  length: number;
  valid: boolean;
  error?: string;
}

export interface RopePath {
  ropeId: string;
  segments: PathSegment[];
  totalLength: number;
  isClosed: boolean;
  isValid: boolean;
  errors: string[];
}

export interface EditorState {
  nodes: Map<string, RopeNode>;
  ropes: Map<string, RopeData>;
  selectedNodeId: string | null;
  selectedRopeId: string | null;
  nextNodeNumber: number;
  validationErrors: ValidationError[];
}

export interface ValidationError {
  type: 'node' | 'rope' | 'path';
  id: string;
  message: string;
  severity: 'error' | 'warning';
}

export type EditorMode = 'select' | 'addNode' | 'addRope' | 'delete' | 'edit';

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

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function calculateDistance(p1: Position, p2: Position): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}
