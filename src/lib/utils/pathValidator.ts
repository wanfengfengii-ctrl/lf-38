import type {
  RopeNode,
  RopeData,
  RopePath,
  PathSegment,
  ValidationError,
  PulleyNode,
  Position,
  PathChainNode
} from '$lib/types';
import {
  calculateDistance,
  applyOffset,
  calculateAngle,
  NODE_TYPE_LABELS,
  PULLEY_DIRECTION_LABELS
} from '$lib/types';

function getNodeEffectivePosition(
  node: RopeNode,
  chainNode: PathChainNode,
  isExit: boolean
): Position {
  const offset = isExit ? chainNode.exitOffset : chainNode.entryOffset;
  return applyOffset(node.position, offset);
}

function validateSegment(
  fromNode: RopeNode,
  toNode: RopeNode,
  fromChainNode: PathChainNode,
  toChainNode: PathChainNode,
  segmentIndex: number
): PathSegment {
  const fromPosition = getNodeEffectivePosition(fromNode, fromChainNode, true);
  const toPosition = getNodeEffectivePosition(toNode, toChainNode, false);

  const length = calculateDistance(fromPosition, toPosition);
  let valid = true;
  let error: string | undefined;

  if (fromNode.id === toNode.id) {
    valid = false;
    error = '缆绳不能连接到同一节点';
  }

  if (fromNode.type === 'pulley' && !(fromNode as PulleyNode).active) {
    valid = false;
    error = `滑轮 "${fromNode.label}" 已停用`;
  }

  if (toNode.type === 'pulley' && !(toNode as PulleyNode).active) {
    valid = false;
    error = `滑轮 "${toNode.label}" 已停用`;
  }

  if (length <= 0) {
    valid = false;
    error = '缆绳段长度必须大于 0';
  }

  return {
    fromNode: fromNode.id,
    toNode: toNode.id,
    fromPosition,
    toPosition,
    fromExitOffset: fromChainNode.exitOffset,
    toEntryOffset: toChainNode.entryOffset,
    length,
    valid,
    error,
    segmentIndex
  };
}

function checkPulleyDirectionSequence(
  chainNodes: PathChainNode[],
  nodes: Map<string, RopeNode>
): { nodeId: string; error: string }[] {
  const errors: { nodeId: string; error: string }[] = [];

  if (chainNodes.length < 3) {
    return errors;
  }

  for (let i = 1; i < chainNodes.length - 1; i++) {
    const chainNode = chainNodes[i];
    const node = nodes.get(chainNode.nodeId);

    if (!node || node.type !== 'pulley') continue;

    const pulley = node as PulleyNode;
    if (!pulley.active) continue;
    if (pulley.direction === 'bidirectional') continue;

    const prevChainNode = chainNodes[i - 1];
    const prevNode = nodes.get(prevChainNode.nodeId);
    const nextChainNode = chainNodes[i + 1];
    const nextNode = nodes.get(nextChainNode.nodeId);

    if (!prevNode || !nextNode) continue;

    const entryPos = getNodeEffectivePosition(prevNode, prevChainNode, true);
    const pulleyPos = getNodeEffectivePosition(pulley, chainNode, false);
    const exitPos = getNodeEffectivePosition(nextNode, nextChainNode, false);

    const entryAngle = calculateAngle(entryPos, pulleyPos);
    const exitAngle = calculateAngle(pulleyPos, exitPos);

    const crossProduct =
      (pulleyPos.x - entryPos.x) * (exitPos.y - pulleyPos.y) -
      (pulleyPos.y - entryPos.y) * (exitPos.x - pulleyPos.x);

    const isClockwise = crossProduct > 0;

    if (pulley.direction === 'clockwise' && !isClockwise) {
      errors.push({
        nodeId: pulley.id,
        error: `滑轮 "${pulley.label}" 方向为顺时针，但穿绕方向为逆时针，请调整入点/出点`
      });
    } else if (pulley.direction === 'counterclockwise' && isClockwise) {
      errors.push({
        nodeId: pulley.id,
        error: `滑轮 "${pulley.label}" 方向为逆时针，但穿绕方向为顺时针，请调整入点/出点`
      });
    }
  }

  return errors;
}

function checkInactivePulleysInPath(
  chainNodes: PathChainNode[],
  nodes: Map<string, RopeNode>
): { nodeId: string; error: string }[] {
  const errors: { nodeId: string; error: string }[] = [];

  for (const chainNode of chainNodes) {
    const node = nodes.get(chainNode.nodeId);
    if (!node) continue;
    if (node.type === 'pulley' && !(node as PulleyNode).active) {
      errors.push({
        nodeId: node.id,
        error: `滑轮 "${node.label}" 已停用，不能参与穿绕路径`
      });
    }
  }

  return errors;
}

function checkContinuity(
  chainNodes: PathChainNode[],
  nodes: Map<string, RopeNode>
): { isContinuous: boolean; error?: string } {
  if (chainNodes.length < 2) {
    return {
      isContinuous: false,
      error: '缆绳路径至少需要 2 个节点'
    };
  }

  for (let i = 0; i < chainNodes.length; i++) {
    const chainNode = chainNodes[i];
    const node = nodes.get(chainNode.nodeId);
    if (!node) {
      return {
        isContinuous: false,
        error: `路径中第 ${i + 1} 个节点不存在`
      };
    }
  }

  for (let i = 0; i < chainNodes.length - 1; i++) {
    const fromChain = chainNodes[i];
    const toChain = chainNodes[i + 1];
    const fromNode = nodes.get(fromChain.nodeId)!;
    const toNode = nodes.get(toChain.nodeId)!;

    if (fromNode.id === toNode.id) {
      return {
        isContinuous: false,
        error: `路径第 ${i + 1} 段连接了相同节点 "${fromNode.label}"`
      };
    }

    const fromPos = getNodeEffectivePosition(fromNode, fromChain, true);
    const toPos = getNodeEffectivePosition(toNode, toChain, false);
    const dist = calculateDistance(fromPos, toPos);

    if (dist <= 0) {
      return {
        isContinuous: false,
        error: `路径第 ${i + 1} 段长度为 0（"${fromNode.label}" → "${toNode.label}"）`
      };
    }
  }

  return { isContinuous: true };
}

export function validateRopePath(
  rope: RopeData,
  nodes: Map<string, RopeNode>,
  _allRopes: Map<string, RopeData>
): RopePath {
  const segments: PathSegment[] = [];
  const errors: string[] = [];
  let totalLength = 0;
  let isValid = true;

  const nodeOrder = rope.nodePath.map(cn => cn.nodeId);

  if (rope.tension <= 0) {
    errors.push('缆绳张力必须大于 0');
    isValid = false;
  }

  if (rope.nodePath.length < 2) {
    errors.push('缆绳穿绕路径至少需要 2 个节点');
    isValid = false;
  }

  const continuity = checkContinuity(rope.nodePath, nodes);
  if (!continuity.isContinuous) {
    isValid = false;
    errors.push(continuity.error || '路径不连续');
  }

  for (let i = 0; i < rope.nodePath.length - 1; i++) {
    const fromChain = rope.nodePath[i];
    const toChain = rope.nodePath[i + 1];
    const fromNode = nodes.get(fromChain.nodeId);
    const toNode = nodes.get(toChain.nodeId);

    if (!fromNode || !toNode) continue;

    const segment = validateSegment(fromNode, toNode, fromChain, toChain, i);
    segments.push(segment);
    totalLength += segment.length;

    if (!segment.valid) {
      isValid = false;
      if (segment.error) {
        errors.push(`第 ${i + 1} 段: ${segment.error}`);
      }
    }
  }

  const inactivePulleyErrors = checkInactivePulleysInPath(rope.nodePath, nodes);
  if (inactivePulleyErrors.length > 0) {
    isValid = false;
    for (const e of inactivePulleyErrors) {
      errors.push(e.error);
    }
  }

  const pulleyDirectionErrors = checkPulleyDirectionSequence(rope.nodePath, nodes);
  if (pulleyDirectionErrors.length > 0) {
    isValid = false;
    for (const e of pulleyDirectionErrors) {
      errors.push(e.error);
    }
  }

  for (const chainNode of rope.nodePath) {
    const node = nodes.get(chainNode.nodeId);
    if (node && node.type === 'pulley') {
      const pulley = node as PulleyNode;
      if (pulley.sheaveCount && pulley.sheaveCount < 1) {
        errors.push(`滑轮 "${pulley.label}" 滑轮槽数必须 ≥ 1`);
        isValid = false;
      }
    }
  }

  return {
    ropeId: rope.id,
    nodeOrder,
    segments,
    totalLength,
    isValid,
    isContinuous: continuity.isContinuous,
    continuityError: continuity.error,
    errors,
    pulleyDirectionErrors,
    inactivePulleyErrors
  };
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
  const usedNumbers = new Map<number, string[]>();

  for (const [id, node] of nodes) {
    if (!usedNumbers.has(node.number)) {
      usedNumbers.set(node.number, []);
    }
    usedNumbers.get(node.number)!.push(id);
  }

  for (const [num, ids] of usedNumbers) {
    if (ids.length > 1) {
      for (const id of ids) {
        errors.push({
          type: 'node',
          id,
          message: `节点编号 ${num} 重复（与其他节点冲突）`,
          severity: 'error'
        });
      }
    }
  }

  for (const [id, node] of nodes) {
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

    if (node.type === 'pulley') {
      const pulley = node as PulleyNode;
      if (pulley.sheaveCount !== undefined && pulley.sheaveCount < 1) {
        errors.push({
          type: 'node',
          id,
          message: `滑轮 "${node.label}" 滑轮槽数必须 ≥ 1`,
          severity: 'error'
        });
      }
      if (!PULLEY_DIRECTION_LABELS[pulley.direction] === undefined) {
        errors.push({
          type: 'node',
          id,
          message: `滑轮 "${node.label}" 方向值无效`,
          severity: 'error'
        });
      }
    }

    if (node.type === 'mast') {
      const mast = node as unknown as { height?: number };
      if (mast.height !== undefined && mast.height < 0) {
        errors.push({
          type: 'node',
          id,
          message: `桅杆 "${node.label}" 高度不能为负数`,
          severity: 'warning'
        });
      }
    }

    if (node.type === 'mooring') {
      const mooring = node as unknown as { loadCapacity?: number };
      if (mooring.loadCapacity !== undefined && mooring.loadCapacity < 0) {
        errors.push({
          type: 'node',
          id,
          message: `系索点 "${node.label}" 负载能力不能为负数`,
          severity: 'warning'
        });
      }
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

    if (!rope.label || rope.label.trim() === '') {
      errors.push({
        type: 'rope',
        id,
        message: `缆绳名称不能为空`,
        severity: 'error'
      });
    }

    if (rope.nodePath.length < 2) {
      errors.push({
        type: 'rope',
        id,
        message: `缆绳 "${rope.label}" 穿绕路径至少需要 2 个节点`,
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

    if (!path.isContinuous && path.continuityError) {
      errors.push({
        type: 'continuity',
        id,
        message: `缆绳 "${rope.label}" ${path.continuityError}`,
        severity: 'error'
      });
    }

    for (const seg of path.segments) {
      if (!seg.valid && seg.error) {
        errors.push({
          type: 'segment',
          id,
          segmentIndex: seg.segmentIndex,
          message: `缆绳 "${rope.label}" 第 ${seg.segmentIndex + 1} 段: ${seg.error}`,
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
  _nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>
): number {
  let total = 0;
  for (const [, rope] of ropes) {
    total += rope.totalLength;
  }
  return total;
}

export function recalculateRopeLengths(
  rope: RopeData,
  nodes: Map<string, RopeNode>
): { totalLength: number; segmentLengths: number[] } {
  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < rope.nodePath.length - 1; i++) {
    const fromChain = rope.nodePath[i];
    const toChain = rope.nodePath[i + 1];
    const fromNode = nodes.get(fromChain.nodeId);
    const toNode = nodes.get(toChain.nodeId);

    if (!fromNode || !toNode) {
      segmentLengths.push(0);
      continue;
    }

    const fromPos = getNodeEffectivePosition(fromNode, fromChain, true);
    const toPos = getNodeEffectivePosition(toNode, toChain, false);
    const length = calculateDistance(fromPos, toPos);
    segmentLengths.push(length);
    totalLength += length;
  }

  return { totalLength, segmentLengths };
}
