import type {
  RopeNode,
  RopeData,
  RopePath,
  PathSegment,
  ValidationError,
  PulleyNode
} from '$lib/types';
import { calculateDistance } from '$lib/types';

export function validateRopePath(
  rope: RopeData,
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): RopePath {
  const segments: PathSegment[] = [];
  const errors: string[] = [];
  let totalLength = 0;
  let isClosed = true;
  let isValid = true;

  if (rope.tension <= 0) {
    errors.push('缆绳张力必须大于 0');
    isValid = false;
  }

  if (rope.length <= 0) {
    errors.push('缆绳长度必须大于 0');
    isValid = false;
  }

  const sourceNode = nodes.get(rope.source);
  const targetNode = nodes.get(rope.target);

  if (!sourceNode) {
    errors.push(`起始节点 ${rope.source} 不存在`);
    isValid = false;
    isClosed = false;
  }

  if (!targetNode) {
    errors.push(`目标节点 ${rope.target} 不存在`);
    isValid = false;
    isClosed = false;
  }

  if (sourceNode && targetNode) {
    const segment = validateSegment(sourceNode, targetNode, nodes, ropes, rope.id);
    segments.push(segment);
    totalLength += segment.length;

    if (!segment.valid) {
      isValid = false;
      if (segment.error) {
        errors.push(segment.error);
      }
    }

    if (sourceNode.type === 'pulley' && !sourceNode.active) {
      errors.push(`滑轮 "${sourceNode.label}" 已停用，不能参与路径`);
      isValid = false;
    }

    if (targetNode.type === 'pulley' && !targetNode.active) {
      errors.push(`滑轮 "${targetNode.label}" 已停用，不能参与路径`);
      isValid = false;
    }

    if (sourceNode.type === 'pulley' && sourceNode.active && 
        targetNode.type === 'pulley' && targetNode.active) {
      if (!checkPulleyDirection(sourceNode, targetNode)) {
        errors.push(`滑轮方向冲突：缆绳从 "${sourceNode.label}" 到 "${targetNode.label}" 的穿绕方向不正确`);
        isValid = false;
      }
    }

    isClosed = checkPathClosed(rope, nodes, ropes);
    if (!isClosed) {
      errors.push('缆绳路径未闭合，首尾断开');
    }
  }

  return {
    ropeId: rope.id,
    segments,
    totalLength,
    isClosed,
    isValid,
    errors
  };
}

function validateSegment(
  fromNode: RopeNode,
  toNode: RopeNode,
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>,
  currentRopeId: string
): PathSegment {
  const length = calculateDistance(fromNode.position, toNode.position);
  let valid = true;
  let error: string | undefined;

  if (fromNode.id === toNode.id) {
    valid = false;
    error = '缆绳不能连接到同一节点';
  }

  if (fromNode.type === 'pulley' && !fromNode.active) {
    valid = false;
    error = `滑轮 "${fromNode.label}" 已停用`;
  }

  if (toNode.type === 'pulley' && !toNode.active) {
    valid = false;
    error = `滑轮 "${toNode.label}" 已停用`;
  }

  for (const [, rope] of ropes) {
    if (rope.id === currentRopeId) continue;
    if (
      (rope.source === fromNode.id && rope.target === toNode.id) ||
      (rope.source === toNode.id && rope.target === fromNode.id)
    ) {
      error = `与缆绳 "${rope.label}" 路径重复`;
      break;
    }
  }

  return {
    fromNode: fromNode.id,
    toNode: toNode.id,
    length,
    valid,
    error
  };
}

function checkPulleyDirection(fromPulley: PulleyNode, toPulley: PulleyNode): boolean {
  if (fromPulley.direction === 'bidirectional' || toPulley.direction === 'bidirectional') {
    return true;
  }

  const dx = toPulley.position.x - fromPulley.position.x;
  const dy = toPulley.position.y - fromPulley.position.y;

  if (fromPulley.direction === 'clockwise') {
    return dx > 0 || (dx === 0 && dy > 0);
  } else if (fromPulley.direction === 'counterclockwise') {
    return dx < 0 || (dx === 0 && dy < 0);
  }

  return true;
}

function checkPathClosed(
  rope: RopeData,
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [rope.source];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (current === rope.target) {
      return true;
    }

    for (const [, r] of ropes) {
      if (r.source === current && !visited.has(r.target)) {
        queue.push(r.target);
      }
      if (r.target === current && !visited.has(r.source)) {
        queue.push(r.source);
      }
    }
  }

  return false;
}

export function validateAllPaths(
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): Map<string, RopePath> {
  const results = new Map<string, RopePath>();
  for (const [, rope] of ropes) {
    results.set(rope.id, validateRopePath(rope, nodes, ropes));
  }
  return results;
}

export function validateNodes(nodes: Map<string, RopeNode>): ValidationError[] {
  const errors: ValidationError[] = [];
  const usedNumbers = new Set<number>();

  for (const [id, node] of nodes) {
    if (usedNumbers.has(node.number)) {
      errors.push({
        type: 'node',
        id,
        message: `节点编号 ${node.number} 重复（与其他节点冲突）`,
        severity: 'error'
      });
    } else {
      usedNumbers.add(node.number);
    }

    if (node.number <= 0) {
      errors.push({
        type: 'node',
        id,
        message: `节点编号必须大于 0`,
        severity: 'error'
      });
    }

    if (!node.label || node.label.trim() === '') {
      errors.push({
        type: 'node',
        id,
        message: `节点名称不能为空`,
        severity: 'error'
      });
    }
  }

  return errors;
}

export function validateRopes(
  ropes: Map<string, RopeData>,
  nodes: Map<string, RopeNode>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [id, rope] of ropes) {
    if (rope.tension <= 0) {
      errors.push({
        type: 'rope',
        id,
        message: `缆绳 "${rope.label}" 的张力必须大于 0`,
        severity: 'error'
      });
    }

    if (rope.length <= 0) {
      errors.push({
        type: 'rope',
        id,
        message: `缆绳 "${rope.label}" 的长度必须大于 0`,
        severity: 'error'
      });
    }

    if (!rope.label || rope.label.trim() === '') {
      errors.push({
        type: 'rope',
        id,
        message: `缆绳名称不能为空`,
        severity: 'error'
      });
    }

    const path = validateRopePath(rope, nodes, ropes);
    if (!path.isValid) {
      for (const err of path.errors) {
        errors.push({
          type: 'path',
          id,
          message: err,
          severity: 'error'
        });
      }
    }
  }

  return errors;
}

export function validateAll(
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): ValidationError[] {
  return [...validateNodes(nodes), ...validateRopes(ropes, nodes)];
}

export function canSave(
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): boolean {
  const errors = validateAll(nodes, ropes);
  return errors.filter(e => e.severity === 'error').length === 0;
}

export function calculateTotalRopeLength(
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): number {
  const paths = validateAllPaths(nodes, ropes);
  let total = 0;
  for (const [, path] of paths) {
    if (path.isValid) {
      total += path.totalLength;
    }
  }
  return total;
}
