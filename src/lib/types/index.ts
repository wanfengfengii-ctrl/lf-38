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
  isClosed: boolean;
  closureError?: string;
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

export type EditorMode = 'select' | 'addNode' | 'addRope' | 'delete' | 'edit' | 'extendPath' | 'review';

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

export interface VersionSnapshot {
  id: string;
  versionNumber: number;
  createdAt: string;
  note: string;
  nodes: RopeNode[];
  ropes: RopeData[];
  stats: {
    nodeCount: number;
    ropeCount: number;
    totalLength: number;
    totalTension: number;
    mastCount: number;
    pulleyCount: number;
    mooringCount: number;
    activePulleyCount: number;
  };
}

export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface NodeDiff {
  nodeId: string;
  changeType: ChangeType;
  label?: string;
  oldNode?: RopeNode;
  newNode?: RopeNode;
  changedFields?: string[];
}

export interface RopeDiff {
  ropeId: string;
  changeType: ChangeType;
  label?: string;
  oldRope?: RopeData;
  newRope?: RopeData;
  changedFields?: string[];
  pathChanges?: {
    type: 'added' | 'removed' | 'reordered';
    nodeId: string;
    index?: number;
  }[];
}

export interface VersionDiff {
  versionAId: string;
  versionBId: string;
  nodeDiffs: NodeDiff[];
  ropeDiffs: RopeDiff[];
  summary: {
    addedNodes: number;
    removedNodes: number;
    modifiedNodes: number;
    addedRopes: number;
    removedRopes: number;
    modifiedRopes: number;
    totalLengthDelta: number;
    totalTensionDelta: number;
  };
}

export interface PlaybackStep {
  stepNumber: number;
  description: string;
  snapshot: VersionSnapshot;
  ropeId?: string;
  changes?: string[];
}

export type ReviewStatus = 'pending' | 'resolved' | 'rejected' | 'in_progress' | 'verified' | 'closed';

export type ReviewTargetType = 'node' | 'rope' | 'general';

export type ReviewPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ReviewUser {
  id: string;
  name: string;
  role: 'librarian' | 'modelist' | 'reviewer' | 'admin';
  avatar?: string;
  color?: string;
}

export interface ReviewSelection {
  targetType: ReviewTargetType;
  nodeIds?: string[];
  ropeIds?: string[];
  boundingBox?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface ReviewCommentReply {
  id: string;
  userId: string;
  userName: string;
  userRole: ReviewUser['role'];
  userColor?: string;
  content: string;
  createdAt: string;
  changedStatusTo?: ReviewStatus;
}

export interface ReviewClosureRecord {
  closedAt: string;
  closedBy: string;
  closedByName: string;
  note?: string;
}

export interface ReviewComment {
  id: string;
  commentNumber: number;
  versionId: string;
  userId: string;
  userName: string;
  userRole: ReviewUser['role'];
  userColor: string;
  content: string;
  createdAt: string;
  status: ReviewStatus;
  priority: ReviewPriority;
  selection: ReviewSelection;
  category?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolveNote?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verifiedByName?: string;
  closure?: ReviewClosureRecord;
  replies: ReviewCommentReply[];
  resolvedVersionId?: string;
  tags?: string[];
  relatedCommentIds?: string[];
}

export type ReviewActivityType =
  | 'comment_created'
  | 'status_changed'
  | 'reply_added'
  | 'priority_changed'
  | 'category_changed'
  | 'version_resolved'
  | 'comment_verified'
  | 'comment_closed'
  | 'comment_reopened'
  | 'selection_updated';

export interface ReviewActivity {
  id: string;
  type: ReviewActivityType;
  commentId: string;
  commentNumber: number;
  userId: string;
  userName: string;
  userColor: string;
  userRole: ReviewUser['role'];
  content: string;
  createdAt: string;
  metadata?: {
    oldStatus?: ReviewStatus;
    newStatus?: ReviewStatus;
    oldPriority?: ReviewPriority;
    newPriority?: ReviewPriority;
    versionId?: string;
    versionNumber?: number;
    targetType?: ReviewTargetType;
    nodeIds?: string[];
    ropeIds?: string[];
  };
}

export interface ReviewMention {
  userId: string;
  userName: string;
  startIndex: number;
  endIndex: number;
}

export interface ReviewTraceabilityLink {
  commentId: string;
  commentNumber: number;
  commentContent: string;
  commentStatus: ReviewStatus;
  commentPriority: ReviewPriority;
  commentUserId: string;
  commentUserName: string;
  commentUserColor: string;
  sourceVersionId: string;
  sourceVersionNumber: number;
  resolvedVersionId?: string;
  resolvedVersionNumber?: number;
  resolutionNote?: string;
  isResolved: boolean;
}

export interface ReviewClosureMetrics {
  totalComments: number;
  pendingCount: number;
  inProgressCount: number;
  resolvedCount: number;
  verifiedCount: number;
  closedCount: number;
  rejectedCount: number;
  closureRate: number;
  avgResolutionTimeMs: number;
  criticalOpen: number;
  highOpen: number;
  byCategory: Record<string, { total: number; resolved: number }>;
  byUser: Record<string, { name: string; color: string; total: number; resolved: number }>;
  recentActivityCount: number;
}

export interface ReviewExportData {
  version: number;
  exportedAt: string;
  reviewComments: ReviewComment[];
  reviewUsers: ReviewUser[];
  reviewActivities?: ReviewActivity[];
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  rejected: '已拒绝',
  verified: '已验证',
  closed: '已关闭'
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-300',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-300',
  resolved: 'bg-green-100 text-green-700 border-green-300',
  rejected: 'bg-gray-100 text-gray-600 border-gray-300',
  verified: 'bg-teal-100 text-teal-700 border-teal-300',
  closed: 'bg-slate-200 text-slate-700 border-slate-400'
};

export const REVIEW_STATUS_FLOW_ORDER: ReviewStatus[] = ['pending', 'in_progress', 'resolved', 'verified', 'closed'];

export const REVIEW_PRIORITY_LABELS: Record<ReviewPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急'
};

export const REVIEW_PRIORITY_COLORS: Record<ReviewPriority, string> = {
  low: 'bg-gray-100 text-gray-600 border-gray-300',
  medium: 'bg-blue-100 text-blue-700 border-blue-300',
  high: 'bg-orange-100 text-orange-700 border-orange-300',
  critical: 'bg-red-100 text-red-700 border-red-300'
};

export const REVIEW_PRIORITY_BADGE: Record<ReviewPriority, string> = {
  low: '#9CA3AF',
  medium: '#3B82F6',
  high: '#F97316',
  critical: '#EF4444'
};

export const REVIEW_CATEGORIES = [
  '结构安全',
  '路径优化',
  '力学合理性',
  '材料选择',
  '工艺性',
  '文档完善',
  '其他'
];

export const REVIEW_ACTIVITY_LABELS: Record<ReviewActivityType, string> = {
  comment_created: '提出意见',
  status_changed: '变更状态',
  reply_added: '添加回复',
  priority_changed: '调整优先级',
  category_changed: '修改分类',
  version_resolved: '版本解决',
  comment_verified: '验证确认',
  comment_closed: '归档关闭',
  comment_reopened: '重新打开',
  selection_updated: '更新圈选'
};

export const REVIEW_ACTIVITY_ICONS: Record<ReviewActivityType, string> = {
  comment_created: '📝',
  status_changed: '🔄',
  reply_added: '💬',
  priority_changed: '⚠️',
  category_changed: '🏷️',
  version_resolved: '📌',
  comment_verified: '✅',
  comment_closed: '📁',
  comment_reopened: '🔓',
  selection_updated: '🎯'
};

export const REVIEW_USER_ROLE_LABELS: Record<ReviewUser['role'], string> = {
  librarian: '馆员',
  modelist: '模型师',
  reviewer: '评审员',
  admin: '管理员'
};

export const REVIEW_USER_ROLE_DESCRIPTIONS: Record<ReviewUser['role'], string> = {
  librarian: '负责文档归档与版本管理',
  modelist: '负责方案建模与参数调整',
  reviewer: '负责方案审查与提出意见',
  admin: '管理员，拥有全部权限'
};

export const REVIEW_USER_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#8B5CF6', '#EC4899', '#F43F5E', '#6366F1'
];

export const PRESET_REVIEW_USERS: ReviewUser[] = [
  { id: 'preset-librarian-1', name: '张馆员', role: 'librarian', color: '#3B82F6' },
  { id: 'preset-librarian-2', name: '李馆员', role: 'librarian', color: '#06B6D4' },
  { id: 'preset-modelist-1', name: '王模型师', role: 'modelist', color: '#F97316' },
  { id: 'preset-modelist-2', name: '赵模型师', role: 'modelist', color: '#8B5CF6' },
  { id: 'preset-reviewer-1', name: '陈评审', role: 'reviewer', color: '#22C55E' },
  { id: 'preset-admin-1', name: '系统管理员', role: 'admin', color: '#EF4444' }
];
