import type {
  RopeNode,
  RopeData,
  VersionSnapshot,
  VersionDiff,
  NodeDiff,
  RopeDiff,
  ChangeType,
  PlaybackStep,
  ReviewComment,
  ReviewCommentReply,
  ReviewStatus
} from '$lib/types';
import { generateId } from '$lib/types';
import { calculateTotalRopeLength } from '$lib/utils/pathValidator';

const REVIEWS_STORAGE_KEY = 'rope-editor-reviews';

export function loadReviews(): ReviewComment[] {
  try {
    const json = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (!json) return [];
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data as ReviewComment[];
  } catch {
    return [];
  }
}

export function saveReviews(reviews: ReviewComment[]): boolean {
  try {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
    return true;
  } catch {
    return false;
  }
}

export function clearReviews(): void {
  try {
    localStorage.removeItem(REVIEWS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const VERSIONS_STORAGE_KEY = 'rope-editor-versions';
const MAX_VERSIONS = 50;

export function createVersionSnapshot(
  nodes: Map<string, RopeNode>,
  ropes: Map<string, RopeData>,
  note: string = '',
  previousVersionNumber: number = 0
): VersionSnapshot {
  const nodesArray = Array.from(nodes.values());
  const ropesArray = Array.from(ropes.values());

  let mastCount = 0;
  let pulleyCount = 0;
  let mooringCount = 0;
  let activePulleyCount = 0;
  let totalTension = 0;

  for (const node of nodesArray) {
    if (node.type === 'mast') mastCount++;
    else if (node.type === 'pulley') {
      pulleyCount++;
      if ((node as any).active) activePulleyCount++;
    } else if (node.type === 'mooring') mooringCount++;
  }

  for (const rope of ropesArray) {
    totalTension += rope.tension;
  }

  return {
    id: generateId(),
    versionNumber: previousVersionNumber + 1,
    createdAt: new Date().toISOString(),
    note,
    nodes: nodesArray,
    ropes: ropesArray,
    stats: {
      nodeCount: nodesArray.length,
      ropeCount: ropesArray.length,
      totalLength: calculateTotalRopeLength(nodes, ropes),
      totalTension,
      mastCount,
      pulleyCount,
      mooringCount,
      activePulleyCount
    }
  };
}

export function saveVersions(versions: VersionSnapshot[]): boolean {
  try {
    const trimmed = versions.slice(-MAX_VERSIONS);
    localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

export function loadVersions(): VersionSnapshot[] {
  try {
    const json = localStorage.getItem(VERSIONS_STORAGE_KEY);
    if (!json) return [];
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data as VersionSnapshot[];
  } catch {
    return [];
  }
}

export function clearVersions(): void {
  try {
    localStorage.removeItem(VERSIONS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function getChangedFields(oldObj: any, newObj: any, excludeKeys: string[] = []): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    if (excludeKeys.includes(key)) continue;
    if (!deepEqual(oldObj[key], newObj[key])) {
      changed.push(key);
    }
  }
  return changed;
}

function diffNodes(
  nodesA: Map<string, RopeNode>,
  nodesB: Map<string, RopeNode>
): NodeDiff[] {
  const result: NodeDiff[] = [];
  const allIds = new Set([...nodesA.keys(), ...nodesB.keys()]);

  for (const id of allIds) {
    const inA = nodesA.has(id);
    const inB = nodesB.has(id);

    let changeType: ChangeType;
    let oldNode: RopeNode | undefined;
    let newNode: RopeNode | undefined;
    let changedFields: string[] | undefined;
    let label: string | undefined;

    if (inA && !inB) {
      changeType = 'removed';
      oldNode = nodesA.get(id);
      label = oldNode?.label;
    } else if (!inA && inB) {
      changeType = 'added';
      newNode = nodesB.get(id);
      label = newNode?.label;
    } else {
      oldNode = nodesA.get(id)!;
      newNode = nodesB.get(id)!;
      changedFields = getChangedFields(oldNode, newNode, ['id']);
      changeType = changedFields.length > 0 ? 'modified' : 'unchanged';
      label = newNode.label;
    }

    if (changeType !== 'unchanged') {
      result.push({
        nodeId: id,
        changeType,
        label,
        oldNode,
        newNode,
        changedFields
      });
    }
  }

  return result;
}

function diffRopes(
  ropesA: Map<string, RopeData>,
  ropesB: Map<string, RopeData>,
  nodesA: Map<string, RopeNode>,
  nodesB: Map<string, RopeNode>
): RopeDiff[] {
  const result: RopeDiff[] = [];
  const allIds = new Set([...ropesA.keys(), ...ropesB.keys()]);

  for (const id of allIds) {
    const inA = ropesA.has(id);
    const inB = ropesB.has(id);

    let changeType: ChangeType;
    let oldRope: RopeData | undefined;
    let newRope: RopeData | undefined;
    let changedFields: string[] | undefined;
    let label: string | undefined;
    let pathChanges: RopeDiff['pathChanges'] | undefined;

    if (inA && !inB) {
      changeType = 'removed';
      oldRope = ropesA.get(id);
      label = oldRope?.label;
    } else if (!inA && inB) {
      changeType = 'added';
      newRope = ropesB.get(id);
      label = newRope?.label;
    } else {
      oldRope = ropesA.get(id)!;
      newRope = ropesB.get(id)!;
      label = newRope.label;

      changedFields = getChangedFields(oldRope, newRope, ['id', 'nodePath', 'segmentLengths']);

      pathChanges = [];
      const oldPathIds = oldRope.nodePath.map(n => n.nodeId);
      const newPathIds = newRope.nodePath.map(n => n.nodeId);

      const oldSet = new Set(oldPathIds);
      const newSet = new Set(newPathIds);

      for (let i = 0; i < newPathIds.length; i++) {
        if (!oldSet.has(newPathIds[i])) {
          pathChanges.push({ type: 'added', nodeId: newPathIds[i], index: i });
        }
      }
      for (let i = 0; i < oldPathIds.length; i++) {
        if (!newSet.has(oldPathIds[i])) {
          pathChanges.push({ type: 'removed', nodeId: oldPathIds[i], index: i });
        }
      }

      if (pathChanges.length === 0) {
        const reordered = oldPathIds.some((pid, i) => pid !== newPathIds[i]);
        if (reordered) {
          for (let i = 0; i < newPathIds.length; i++) {
            if (oldPathIds[i] !== newPathIds[i]) {
              pathChanges.push({ type: 'reordered', nodeId: newPathIds[i], index: i });
            }
          }
        }
      }

      if (pathChanges.length > 0) {
        if (!changedFields.includes('nodePath')) changedFields.push('nodePath');
      } else {
        pathChanges = undefined;
      }

      if (changedFields.length === 0 && !pathChanges) {
        changeType = 'unchanged';
      } else {
        changeType = 'modified';
      }
    }

    if (changeType !== 'unchanged') {
      result.push({
        ropeId: id,
        changeType,
        label,
        oldRope,
        newRope,
        changedFields,
        pathChanges
      });
    }
  }

  return result;
}

export function compareVersions(versionA: VersionSnapshot, versionB: VersionSnapshot): VersionDiff {
  const nodesA = new Map<string, RopeNode>();
  const nodesB = new Map<string, RopeNode>();
  const ropesA = new Map<string, RopeData>();
  const ropesB = new Map<string, RopeData>();

  for (const n of versionA.nodes) nodesA.set(n.id, n);
  for (const n of versionB.nodes) nodesB.set(n.id, n);
  for (const r of versionA.ropes) ropesA.set(r.id, r);
  for (const r of versionB.ropes) ropesB.set(r.id, r);

  const nodeDiffs = diffNodes(nodesA, nodesB);
  const ropeDiffs = diffRopes(ropesA, ropesB, nodesA, nodesB);

  const summary = {
    addedNodes: nodeDiffs.filter(d => d.changeType === 'added').length,
    removedNodes: nodeDiffs.filter(d => d.changeType === 'removed').length,
    modifiedNodes: nodeDiffs.filter(d => d.changeType === 'modified').length,
    addedRopes: ropeDiffs.filter(d => d.changeType === 'added').length,
    removedRopes: ropeDiffs.filter(d => d.changeType === 'removed').length,
    modifiedRopes: ropeDiffs.filter(d => d.changeType === 'modified').length,
    totalLengthDelta: versionB.stats.totalLength - versionA.stats.totalLength,
    totalTensionDelta: versionB.stats.totalTension - versionA.stats.totalTension
  };

  return {
    versionAId: versionA.id,
    versionBId: versionB.id,
    nodeDiffs,
    ropeDiffs,
    summary
  };
}

export function generatePlaybackSteps(
  versions: VersionSnapshot[],
  targetRopeId?: string
): PlaybackStep[] {
  if (versions.length === 0) return [];

  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);

  if (targetRopeId) {
    const ropeExistsInVersion = (v: VersionSnapshot): boolean => {
      return v.ropes.some(r => r.id === targetRopeId);
    };

    const filtered = sorted.filter(ropeExistsInVersion);
    if (filtered.length === 0) return [];

    const steps: PlaybackStep[] = [];

    for (let i = 0; i < filtered.length; i++) {
      const snapshot = filtered[i];
      const changes: string[] = [];
      const currentRope = snapshot.ropes.find(r => r.id === targetRopeId)!;
      const currentNodeIds = new Set(currentRope.nodePath.map(cn => cn.nodeId));

      if (i > 0) {
        const prev = filtered[i - 1];
        const prevRope = prev.ropes.find(r => r.id === targetRopeId);

        if (prevRope) {
          const prevNodeIds = new Set(prevRope.nodePath.map(cn => cn.nodeId));

          const addedNodes: string[] = [];
          const removedNodes: string[] = [];
          for (const nid of currentNodeIds) {
            if (!prevNodeIds.has(nid)) addedNodes.push(nid);
          }
          for (const nid of prevNodeIds) {
            if (!currentNodeIds.has(nid)) removedNodes.push(nid);
          }

          if (addedNodes.length > 0) {
            const nodeLabels = addedNodes.map(nid => {
              const node = snapshot.nodes.find(n => n.id === nid);
              return node?.label || nid;
            }).join('、');
            changes.push(`新增节点：${nodeLabels}`);
          }
          if (removedNodes.length > 0) {
            const nodeLabels = removedNodes.map(nid => {
              const node = prev.nodes.find(n => n.id === nid);
              return node?.label || nid;
            }).join('、');
            changes.push(`删除节点：${nodeLabels}`);
          }

          const reordered = prevRope.nodePath.some((cn, idx) => cn.nodeId !== currentRope.nodePath[idx]?.nodeId);
          if (reordered && addedNodes.length === 0 && removedNodes.length === 0) {
            changes.push('穿绕顺序调整');
          }

          if (Math.abs(currentRope.tension - prevRope.tension) > 0.01) {
            const delta = currentRope.tension - prevRope.tension;
            changes.push(`张力${delta > 0 ? '+' : ''}${delta.toFixed(0)}N`);
          }

          if (Math.abs(currentRope.totalLength - prevRope.totalLength) > 0.01) {
            const delta = currentRope.totalLength - prevRope.totalLength;
            changes.push(`长度${delta > 0 ? '+' : ''}${delta.toFixed(1)}m`);
          }

          if (currentRope.color !== prevRope.color) {
            changes.push('颜色变更');
          }

          if (currentRope.label !== prevRope.label) {
            changes.push(`标签变更：${prevRope.label} → ${currentRope.label}`);
          }

          for (let j = 0; j < currentRope.nodePath.length; j++) {
            const currCN = currentRope.nodePath[j];
            const prevCN = prevRope.nodePath.find(cn => cn.nodeId === currCN.nodeId);
            if (prevCN) {
              const entryDx = currCN.entryOffset.dx - prevCN.entryOffset.dx;
              const entryDy = currCN.entryOffset.dy - prevCN.entryOffset.dy;
              const exitDx = currCN.exitOffset.dx - prevCN.exitOffset.dx;
              const exitDy = currCN.exitOffset.dy - prevCN.exitOffset.dy;

              if (Math.abs(entryDx) > 0.01 || Math.abs(entryDy) > 0.01 ||
                  Math.abs(exitDx) > 0.01 || Math.abs(exitDy) > 0.01) {
                const node = snapshot.nodes.find(n => n.id === currCN.nodeId);
                changes.push(`${node?.label || '节点'} 入点/出点偏移调整`);
                break;
              }
            }
          }
        } else {
          changes.push(`缆绳「${currentRope.label}」首次出现`);
        }
      } else {
        changes.push(`缆绳「${currentRope.label}」初始方案：${currentRope.nodePath.length} 个节点，长度 ${currentRope.totalLength.toFixed(1)}m，张力 ${currentRope.tension.toFixed(0)}N`);
      }

      const modifiedSnapshot: VersionSnapshot = {
        ...snapshot,
        nodes: snapshot.nodes.filter(n => currentNodeIds.has(n.id)),
        ropes: [currentRope],
        stats: {
          ...snapshot.stats,
          nodeCount: currentNodeIds.size,
          ropeCount: 1,
          totalLength: currentRope.totalLength,
          totalTension: currentRope.tension
        }
      };

      steps.push({
        stepNumber: i + 1,
        description: snapshot.note || (changes.length > 0 ? changes.join('；') : `版本 ${snapshot.versionNumber}`),
        snapshot: modifiedSnapshot,
        ropeId: targetRopeId,
        changes: changes.length > 0 ? changes : undefined
      });
    }

    return steps;
  }

  const steps: PlaybackStep[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const snapshot = sorted[i];
    const changes: string[] = [];

    if (i > 0) {
      const prev = sorted[i - 1];
      const diff = compareVersions(prev, snapshot);

      if (diff.summary.addedNodes > 0) changes.push(`新增 ${diff.summary.addedNodes} 个节点`);
      if (diff.summary.removedNodes > 0) changes.push(`删除 ${diff.summary.removedNodes} 个节点`);
      if (diff.summary.modifiedNodes > 0) changes.push(`修改 ${diff.summary.modifiedNodes} 个节点`);
      if (diff.summary.addedRopes > 0) changes.push(`新增 ${diff.summary.addedRopes} 根缆绳`);
      if (diff.summary.removedRopes > 0) changes.push(`删除 ${diff.summary.removedRopes} 根缆绳`);
      if (diff.summary.modifiedRopes > 0) changes.push(`修改 ${diff.summary.modifiedRopes} 根缆绳`);
      if (Math.abs(diff.summary.totalLengthDelta) > 0.01) {
        const sign = diff.summary.totalLengthDelta > 0 ? '+' : '';
        changes.push(`总长度变化 ${sign}${diff.summary.totalLengthDelta.toFixed(1)}m`);
      }
    } else {
      changes.push(`初始方案：${snapshot.stats.nodeCount} 个节点，${snapshot.stats.ropeCount} 根缆绳`);
    }

    steps.push({
      stepNumber: i + 1,
      description: snapshot.note || (changes.length > 0 ? changes.join('；') : `版本 ${snapshot.versionNumber}`),
      snapshot,
      ropeId: targetRopeId,
      changes: changes.length > 0 ? changes : undefined
    });
  }

  return steps;
}

export function restoreVersion(snapshot: VersionSnapshot): {
  nodes: Map<string, RopeNode>;
  ropes: Map<string, RopeData>;
} {
  const nodes = new Map<string, RopeNode>();
  const ropes = new Map<string, RopeData>();

  for (const n of snapshot.nodes) {
    nodes.set(n.id, JSON.parse(JSON.stringify(n)));
  }
  for (const r of snapshot.ropes) {
    ropes.set(r.id, JSON.parse(JSON.stringify(r)));
  }

  return { nodes, ropes };
}

export function exportVersions(versions: VersionSnapshot[]): string {
  return JSON.stringify(versions, null, 2);
}

export function importVersions(json: string): VersionSnapshot[] | null {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return null;
    return data as VersionSnapshot[];
  } catch {
    return null;
  }
}
