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
  PathChainOffset,
  VersionSnapshot,
  VersionDiff,
  PlaybackStep,
  ReviewComment,
  ReviewCommentReply,
  ReviewStatus,
  ReviewSelection,
  ReviewUser,
  ReviewPriority,
  ReviewExportData,
  ReviewActivity,
  ReviewActivityType,
  ReviewMention,
  ReviewTraceabilityLink,
  ReviewClosureMetrics,
  ReviewTargetType,
  NodeDiff,
  RopeDiff
} from '$lib/types';
import {
  generateId,
  NODE_TYPE_LABELS,
  ROPE_COLORS,
  DEFAULT_ROPE_COLOR,
  createDefaultPathChainNode,
  NODE_RADIUS,
  REVIEW_USER_COLORS,
  REVIEW_PRIORITY_LABELS
} from '$lib/types';
import {
  validateAll,
  validateAllPaths,
  canSave,
  calculateTotalRopeLength,
  validateRopePath,
  recalculateRopeLengths
} from '$lib/utils/pathValidator';
import {
  createVersionSnapshot,
  saveVersions,
  loadVersions,
  clearVersions as clearVersionsStorage,
  compareVersions as doCompareVersions,
  generatePlaybackSteps as doGeneratePlaybackSteps,
  restoreVersion as doRestoreVersion,
  exportVersions as doExportVersions,
  importVersions as doImportVersions,
  loadReviews as doLoadReviews,
  saveReviews as doSaveReviews,
  clearReviews as doClearReviews
} from '$lib/utils/versionManager';

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
  const versions = writable<VersionSnapshot[]>([]);
  const viewingVersionId = writable<string | null>(null);
  const compareVersionAId = writable<string | null>(null);
  const compareVersionBId = writable<string | null>(null);
  const currentDiff = writable<VersionDiff | null>(null);
  const playbackSteps = writable<PlaybackStep[]>([]);
  const playbackIndex = writable<number>(-1);
  const isPlaybackMode = writable<boolean>(false);
  const playbackRopeId = writable<string | null>(null);

  const reviewComments = writable<ReviewComment[]>([]);
  const currentReviewUser = writable<ReviewUser | null>(null);
  const reviewSelection = writable<ReviewSelection>({ targetType: 'general' });
  const isReviewSelectionActive = writable<boolean>(false);
  const selectedReviewCommentId = writable<string | null>(null);
  const reviewFilterStatus = writable<ReviewStatus | 'all'>('all');
  const reviewFilterUserId = writable<string | null>(null);
  const showPlaybackComments = writable<boolean>(true);
  const diffFilterCommentId = writable<string | null>(null);
  const reviewFilterPriority = writable<ReviewPriority | 'all'>('all');
  const reviewFilterCategory = writable<string | 'all'>('all');
  const newReviewCommentPriority = writable<ReviewPriority>('medium');
  const newReviewCommentCategory = writable<string | ''>('');
  const reviewUsersRegistry = writable<ReviewUser[]>([]);
  const lastCommentNumber = writable<number>(0);
  const reviewActivities = writable<ReviewActivity[]>([]);

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

  function loadVersionsFromStorage(): void {
    const loaded = loadVersions();
    versions.set(loaded);
  }

  function getNextVersionNumber(): number {
    const $versions = get(versions);
    if ($versions.length === 0) return 0;
    return Math.max(...$versions.map(v => v.versionNumber));
  }

  function createVersion(note: string = ''): VersionSnapshot | null {
    const $nodes = get(nodes);
    const $ropes = get(ropes);
    if (!canSave($nodes, $ropes)) {
      return null;
    }
    const snapshot = createVersionSnapshot($nodes, $ropes, note, getNextVersionNumber());
    versions.update(($versions) => {
      const updated = [...$versions, snapshot];
      saveVersions(updated);
      return updated;
    });
    return snapshot;
  }

  function deleteVersion(versionId: string): boolean {
    versions.update(($versions) => {
      const updated = $versions.filter(v => v.id !== versionId);
      saveVersions(updated);
      return updated;
    });
    if (get(compareVersionAId) === versionId) compareVersionAId.set(null);
    if (get(compareVersionBId) === versionId) compareVersionBId.set(null);
    if (get(viewingVersionId) === versionId) exitViewVersion();
    return true;
  }

  function clearAllVersions(): void {
    clearVersionsStorage();
    versions.set([]);
    compareVersionAId.set(null);
    compareVersionBId.set(null);
    currentDiff.set(null);
    viewingVersionId.set(null);
    stopPlayback();
  }

  function viewVersion(versionId: string): boolean {
    const $versions = get(versions);
    const snapshot = $versions.find(v => v.id === versionId);
    if (!snapshot) return false;

    const restored = doRestoreVersion(snapshot);
    nodes.set(restored.nodes);
    ropes.set(restored.ropes);
    nextNodeNumber.set(getNextNodeNumber());
    viewingVersionId.set(versionId);
    clearSelection();
    return true;
  }

  function exitViewVersion(): void {
    viewingVersionId.set(null);
    loadFromLocalStorage();
  }

  function setCompareVersionA(versionId: string | null): void {
    compareVersionAId.set(versionId);
    updateDiffIfReady();
  }

  function setCompareVersionB(versionId: string | null): void {
    compareVersionBId.set(versionId);
    updateDiffIfReady();
  }

  function updateDiffIfReady(): void {
    const aId = get(compareVersionAId);
    const bId = get(compareVersionBId);
    if (!aId || !bId) {
      currentDiff.set(null);
      return;
    }
    const $versions = get(versions);
    const a = $versions.find(v => v.id === aId);
    const b = $versions.find(v => v.id === bId);
    if (!a || !b) {
      currentDiff.set(null);
      return;
    }
    currentDiff.set(doCompareVersions(a, b));
  }

  function clearCompare(): void {
    compareVersionAId.set(null);
    compareVersionBId.set(null);
    currentDiff.set(null);
  }

  function startPlayback(targetRopeId?: string): boolean {
    const $versions = get(versions);
    if ($versions.length < 2) return false;

    const steps = doGeneratePlaybackSteps($versions, targetRopeId);
    if (steps.length < 2) return false;

    playbackSteps.set(steps);
    playbackRopeId.set(targetRopeId || null);
    playbackIndex.set(0);
    isPlaybackMode.set(true);
    applyPlaybackStep(0);
    return true;
  }

  function applyPlaybackStep(index: number): void {
    const $steps = get(playbackSteps);
    if (index < 0 || index >= $steps.length) return;
    const step = $steps[index];
    const restored = doRestoreVersion(step.snapshot);

    nodes.set(restored.nodes);
    ropes.set(restored.ropes);
    nextNodeNumber.set(getNextNodeNumber());
    playbackIndex.set(index);
    clearSelection();
    if (step.ropeId && restored.ropes.has(step.ropeId)) {
      selectedRopeId.set(step.ropeId);
    }
  }

  function nextPlaybackStep(): boolean {
    const $steps = get(playbackSteps);
    const current = get(playbackIndex);
    if (current < $steps.length - 1) {
      applyPlaybackStep(current + 1);
      return true;
    }
    return false;
  }

  function prevPlaybackStep(): boolean {
    const current = get(playbackIndex);
    if (current > 0) {
      applyPlaybackStep(current - 1);
      return true;
    }
    return false;
  }

  function goToPlaybackStep(index: number): boolean {
    const $steps = get(playbackSteps);
    if (index >= 0 && index < $steps.length) {
      applyPlaybackStep(index);
      return true;
    }
    return false;
  }

  function stopPlayback(): void {
    isPlaybackMode.set(false);
    playbackSteps.set([]);
    playbackIndex.set(-1);
    playbackRopeId.set(null);
    if (get(viewingVersionId)) {
      exitViewVersion();
    }
  }

  function exportAllVersions(): string {
    return doExportVersions(get(versions));
  }

  function importAllVersions(json: string): boolean {
    const imported = doImportVersions(json);
    if (!imported) return false;
    const existing = get(versions);
    const existingIds = new Set(existing.map(v => v.id));
    const merged = [...existing];
    let nextNum = getNextVersionNumber();
    for (const v of imported) {
      if (!existingIds.has(v.id)) {
        nextNum++;
        merged.push({ ...v, id: generateId(), versionNumber: nextNum });
      }
    }
    versions.set(merged);
    saveVersions(merged);
    return true;
  }

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

      createVersion('自动保存 - ' + new Date().toLocaleString('zh-CN'));

      return true;
    } catch {
      return false;
    }
  }

  function loadFromLocalStorage(): boolean {
    try {
      loadVersionsFromStorage();
      loadReviewsFromStorage();
      ensureDefaultReviewUser();
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

  function loadReviewsFromStorage(): void {
    const loaded = doLoadReviews();
    reviewComments.set(loaded);
  }

  function persistReviews(): void {
    const $comments = get(reviewComments);
    doSaveReviews($comments);
  }

  function setCurrentReviewUser(user: ReviewUser | null): void {
    currentReviewUser.set(user);
  }

  function ensureDefaultReviewUser(): ReviewUser {
    const existing = get(currentReviewUser);
    if (existing) return existing;

    const colorIdx = Math.floor(Math.random() * REVIEW_USER_COLORS.length);
    const defaultUser: ReviewUser = {
      id: 'user-' + generateId(),
      name: '评审员 ' + Math.floor(Math.random() * 1000),
      role: 'reviewer',
      color: REVIEW_USER_COLORS[colorIdx]
    };
    currentReviewUser.set(defaultUser);
    return defaultUser;
  }

  function startReviewSelection(targetType: ReviewTargetType = 'general'): void {
    isReviewSelectionActive.set(true);
    reviewSelection.set({ targetType });
    mode.set('review');
  }

  function addNodeToReviewSelection(nodeId: string): void {
    reviewSelection.update(($sel) => {
      const nodeIds = new Set($sel.nodeIds || []);
      nodeIds.add(nodeId);
      return {
        ...$sel,
        targetType: $sel.targetType === 'general' ? 'node' : $sel.targetType,
        nodeIds: Array.from(nodeIds)
      };
    });
  }

  function addRopeToReviewSelection(ropeId: string): void {
    reviewSelection.update(($sel) => {
      const ropeIds = new Set($sel.ropeIds || []);
      ropeIds.add(ropeId);
      return {
        ...$sel,
        targetType: $sel.targetType === 'general' ? 'rope' : $sel.targetType,
        ropeIds: Array.from(ropeIds)
      };
    });
  }

  function removeNodeFromReviewSelection(nodeId: string): void {
    reviewSelection.update(($sel) => {
      const nodeIds = ($sel.nodeIds || []).filter(id => id !== nodeId);
      return {
        ...$sel,
        nodeIds: nodeIds.length > 0 ? nodeIds : undefined,
        targetType: nodeIds.length === 0 && !$sel.ropeIds?.length ? 'general' : $sel.targetType
      };
    });
  }

  function removeRopeFromReviewSelection(ropeId: string): void {
    reviewSelection.update(($sel) => {
      const ropeIds = ($sel.ropeIds || []).filter(id => id !== ropeId);
      return {
        ...$sel,
        ropeIds: ropeIds.length > 0 ? ropeIds : undefined,
        targetType: ropeIds.length === 0 && !$sel.nodeIds?.length ? 'general' : $sel.targetType
      };
    });
  }

  function clearReviewSelection(): void {
    reviewSelection.set({ targetType: 'general' });
  }

  function cancelReviewSelection(): void {
    isReviewSelectionActive.set(false);
    clearReviewSelection();
    if (get(mode) === 'review') {
      mode.set('select');
    }
  }

  function getNextCommentNumber(): number {
    const current = get(lastCommentNumber);
    const $comments = get(reviewComments);
    let maxNum = current;
    for (const c of $comments) {
      if (c.commentNumber && c.commentNumber > maxNum) {
        maxNum = c.commentNumber;
      }
    }
    const next = maxNum + 1;
    lastCommentNumber.set(next);
    return next;
  }

  function createReviewComment(
    content: string,
    versionId?: string,
    options?: {
      priority?: ReviewPriority;
      category?: string;
      tags?: string[];
    }
  ): ReviewComment | null {
    const user = ensureDefaultReviewUser();
    const $selection = get(reviewSelection);
    const $viewingVersionId = get(viewingVersionId);
    const effectiveVersionId = versionId || $viewingVersionId;

    if (!effectiveVersionId && $selection.targetType !== 'general') {
      return null;
    }

    const optsPriority = options?.priority;
    const storePriority = get(newReviewCommentPriority);
    const priority = optsPriority !== undefined && optsPriority !== null ? optsPriority : (storePriority || 'medium');
    const optsCategory = options?.category;
    const storeCategory = get(newReviewCommentCategory);
    const category = optsCategory || storeCategory || undefined;

    const comment: ReviewComment = {
      id: generateId(),
      commentNumber: getNextCommentNumber(),
      versionId: effectiveVersionId || '',
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      userColor: user.color || REVIEW_USER_COLORS[0],
      content,
      createdAt: new Date().toISOString(),
      status: 'pending',
      priority,
      selection: { ...$selection },
      category,
      tags: options?.tags,
      replies: []
    };

    registerReviewUser(user);

    reviewComments.update(($comments) => {
      const updated = [...$comments, comment];
      doSaveReviews(updated);
      return updated;
    });

    clearReviewSelection();
    isReviewSelectionActive.set(false);
    newReviewCommentCategory.set('');
    newReviewCommentPriority.set('medium');

    addReviewActivity('comment_created', comment.id, comment.commentNumber, content, {
      targetType: $selection.targetType,
      nodeIds: $selection.nodeIds,
      ropeIds: $selection.ropeIds
    });

    const mentions = parseMentions(content);
    if (mentions.length > 0) {
      for (const m of mentions) {
        addReviewActivity('reply_added', comment.id, comment.commentNumber, `@${m.userName} 被提及`);
      }
    }

    return comment;
  }

  function registerReviewUser(user: ReviewUser): void {
    reviewUsersRegistry.update(($users) => {
      const exists = $users.some(u => u.id === user.id);
      if (exists) return $users;
      return [...$users, user];
    });
  }

  function getAllReviewUsers(): ReviewUser[] {
    const users = new Map<string, ReviewUser>();
    for (const u of get(reviewUsersRegistry)) {
      users.set(u.id, u);
    }
    for (const c of get(reviewComments)) {
      if (!users.has(c.userId)) {
        users.set(c.userId, {
          id: c.userId,
          name: c.userName,
          role: c.userRole,
          color: c.userColor
        });
      }
    }
    return Array.from(users.values());
  }

  function setNewReviewCommentPriority(priority: ReviewPriority): void {
    newReviewCommentPriority.set(priority);
  }

  function setNewReviewCommentCategory(category: string): void {
    newReviewCommentCategory.set(category);
  }

  function setDiffFilterCommentId(commentId: string | null): void {
    diffFilterCommentId.set(commentId);
  }

  function setReviewFilterPriority(priority: ReviewPriority | 'all'): void {
    reviewFilterPriority.set(priority);
  }

  function setReviewFilterCategory(category: string | 'all'): void {
    reviewFilterCategory.set(category);
  }

  function getFilteredDiffForComment(diff: VersionDiff | null, commentId: string): {
    nodeDiffs: NodeDiff[];
    ropeDiffs: RopeDiff[];
  } | null {
    if (!diff) return null;
    const $comments = get(reviewComments);
    const comment = $comments.find(c => c.id === commentId);
    if (!comment) return null;

    const targetNodeIds = new Set(comment.selection.nodeIds || []);
    const targetRopeIds = new Set(comment.selection.ropeIds || []);

    const allRelatedNodeIds = new Set(targetNodeIds);
    const allRelatedRopeIds = new Set(targetRopeIds);

    if (comment.resolvedVersionId) {
      for (const nid of (comment.selection.nodeIds || [])) {
        allRelatedNodeIds.add(nid);
      }
    }

    const filteredNodeDiffs = diff.nodeDiffs.filter(nd => {
      return targetNodeIds.has(nd.nodeId) || isNodeRelatedToRopeIds(nd.nodeId, targetRopeIds, diff);
    });

    const filteredRopeDiffs = diff.ropeDiffs.filter(rd => {
      return targetRopeIds.has(rd.ropeId) || isRopeRelatedToNodeIds(rd.ropeId, targetNodeIds, diff);
    });

    return { nodeDiffs: filteredNodeDiffs, ropeDiffs: filteredRopeDiffs };
  }

  function isNodeRelatedToRopeIds(nodeId: string, ropeIds: Set<string>, diff: VersionDiff): boolean {
    for (const rd of diff.ropeDiffs) {
      if (!ropeIds.has(rd.ropeId)) continue;
      const rope = rd.newRope || rd.oldRope;
      if (!rope) continue;
      if (rope.nodePath.some(cn => cn.nodeId === nodeId)) return true;
    }
    return false;
  }

  function isRopeRelatedToNodeIds(ropeId: string, nodeIds: Set<string>, diff: VersionDiff): boolean {
    const rd = diff.ropeDiffs.find(x => x.ropeId === ropeId);
    if (!rd) return false;
    const rope = rd.newRope || rd.oldRope;
    if (!rope) return false;
    return rope.nodePath.some(cn => nodeIds.has(cn.nodeId));
  }

  function getRelatedCommentsForDiffItem(
    diffType: 'node' | 'rope',
    itemId: string,
    diff: VersionDiff
  ): ReviewComment[] {
    const result: ReviewComment[] = [];
    const $comments = get(reviewComments);
    const versionIds = new Set([diff.versionAId, diff.versionBId]);

    for (const c of $comments) {
      if (!versionIds.has(c.versionId) && c.resolvedVersionId !== diff.versionBId) continue;
      const targetNodeIds = new Set(c.selection.nodeIds || []);
      const targetRopeIds = new Set(c.selection.ropeIds || []);
      let match = false;
      if (diffType === 'node' && targetNodeIds.has(itemId)) match = true;
      if (diffType === 'rope' && targetRopeIds.has(itemId)) match = true;
      if (diffType === 'rope' && isRopeRelatedToNodeIds(itemId, targetNodeIds, diff)) match = true;
      if (diffType === 'node' && isNodeRelatedToRopeIds(itemId, targetRopeIds, diff)) match = true;
      if (match) result.push(c);
    }
    return result;
  }

  function getVersionDiffForComment(commentId: string): {
    fromVersion: VersionSnapshot | null;
    toVersion: VersionSnapshot | null;
  } {
    const $comments = get(reviewComments);
    const $versions = get(versions);
    const comment = $comments.find(c => c.id === commentId);
    if (!comment) return { fromVersion: null, toVersion: null };

    const sorted = [...$versions].sort((a, b) => a.versionNumber - b.versionNumber);
    const commentVerIdx = sorted.findIndex(v => v.id === comment.versionId);

    let fromVersion = commentVerIdx >= 0 ? sorted[commentVerIdx] : null;
    let toVersion = null;

    if (comment.resolvedVersionId) {
      toVersion = sorted.find(v => v.id === comment.resolvedVersionId) || null;
      if (commentVerIdx >= 0 && !fromVersion) {
        fromVersion = sorted[commentVerIdx];
      }
    } else if (commentVerIdx >= 0 && commentVerIdx < sorted.length - 1) {
      toVersion = sorted[sorted.length - 1];
    } else if (commentVerIdx < 0 && sorted.length > 0) {
      fromVersion = sorted[0];
      toVersion = sorted[sorted.length - 1];
    }

    return { fromVersion, toVersion };
  }

  function updateReviewCommentStatus(
    commentId: string,
    status: ReviewStatus,
    replyContent?: string
  ): boolean {
    const user = ensureDefaultReviewUser();
    registerReviewUser(user);

    let success = false;
    let oldStatus: ReviewStatus | undefined;
    let commentNumber = 0;
    reviewComments.update(($comments) => {
      const idx = $comments.findIndex(c => c.id === commentId);
      if (idx === -1) return $comments;

      const comment = $comments[idx];
      oldStatus = comment.status;
      commentNumber = comment.commentNumber;
      const statusLabels: Record<ReviewStatus, string> = {
        pending: '待处理',
        in_progress: '处理中',
        resolved: '已解决',
        rejected: '已拒绝',
        verified: '已验证',
        closed: '已关闭'
      };
      const reply: ReviewCommentReply = {
        id: generateId(),
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userColor: user.color,
        content: replyContent || `状态变更为：${statusLabels[status]}`,
        createdAt: new Date().toISOString(),
        changedStatusTo: status
      };

      const updated: ReviewComment = {
        ...comment,
        status,
        replies: [...comment.replies, reply],
        ...(status === 'resolved' ? {
          resolvedAt: new Date().toISOString(),
          resolvedBy: user.id,
          resolvedByName: user.name
        } : {}),
        ...(status === 'verified' ? {
          verifiedAt: new Date().toISOString(),
          verifiedBy: user.id,
          verifiedByName: user.name
        } : {}),
        ...(status === 'closed' ? {
          closure: {
            closedAt: new Date().toISOString(),
            closedBy: user.id,
            closedByName: user.name,
            note: replyContent
          }
        } : {})
      };

      const result = [...$comments];
      result[idx] = updated;
      doSaveReviews(result);
      success = true;
      return result;
    });

    if (success) {
      const activityTypeMap: Partial<Record<ReviewStatus, ReviewActivityType>> = {
        verified: 'comment_verified',
        closed: 'comment_closed',
        in_progress: 'status_changed',
        pending: 'comment_reopened'
      };
      const activityType = activityTypeMap[status] || 'status_changed';
      addReviewActivity(activityType, commentId, commentNumber, replyContent || `状态变更为${status}`, {
        oldStatus,
        newStatus: status
      });
    }

    return success;
  }

  function verifyReviewComment(commentId: string, note?: string): boolean {
    const $comments = get(reviewComments);
    const comment = $comments.find(c => c.id === commentId);
    if (!comment) return false;
    if (comment.status !== 'resolved') {
      if (!updateReviewCommentStatus(commentId, 'resolved', '自动标记解决后验证')) {
        return false;
      }
    }
    return updateReviewCommentStatus(commentId, 'verified', note || '验证通过：问题已正确解决');
  }

  function closeReviewComment(commentId: string, note?: string): boolean {
    return updateReviewCommentStatus(commentId, 'closed', note);
  }

  function reopenReviewComment(commentId: string, note?: string): boolean {
    return updateReviewCommentStatus(commentId, 'in_progress', note || '重新打开评审意见');
  }

  function updateReviewCommentPriority(commentId: string, priority: ReviewPriority): boolean {
    let success = false;
    let oldPriority: ReviewPriority | undefined;
    let commentNumber = 0;
    reviewComments.update(($comments) => {
      const idx = $comments.findIndex(c => c.id === commentId);
      if (idx === -1) return $comments;
      oldPriority = $comments[idx].priority;
      commentNumber = $comments[idx].commentNumber;
      const result = [...$comments];
      result[idx] = { ...result[idx], priority };
      doSaveReviews(result);
      success = true;
      return result;
    });
    if (success && oldPriority) {
      addReviewActivity('priority_changed', commentId, commentNumber, `优先级变更为${REVIEW_PRIORITY_LABELS[priority]}`, {
        oldPriority,
        newPriority: priority
      });
    }
    return success;
  }

  function updateReviewCommentCategory(commentId: string, category: string): boolean {
    let success = false;
    let oldCategory: string | undefined;
    let commentNumber = 0;
    reviewComments.update(($comments) => {
      const idx = $comments.findIndex(c => c.id === commentId);
      if (idx === -1) return $comments;
      oldCategory = $comments[idx].category;
      commentNumber = $comments[idx].commentNumber;
      const result = [...$comments];
      result[idx] = { ...result[idx], category: category || undefined };
      doSaveReviews(result);
      success = true;
      return result;
    });
    if (success) {
      addReviewActivity('category_changed', commentId, commentNumber, `分类变更为${category || '无'}`);
    }
    return success;
  }

  function addReviewCommentReply(commentId: string, content: string): boolean {
    const user = ensureDefaultReviewUser();
    registerReviewUser(user);

    let success = false;
    let commentNumber = 0;
    reviewComments.update(($comments) => {
      const idx = $comments.findIndex(c => c.id === commentId);
      if (idx === -1) return $comments;

      const comment = $comments[idx];
      commentNumber = comment.commentNumber;
      const reply: ReviewCommentReply = {
        id: generateId(),
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userColor: user.color,
        content,
        createdAt: new Date().toISOString()
      };

      const updated: ReviewComment = {
        ...comment,
        replies: [...comment.replies, reply]
      };

      const result = [...$comments];
      result[idx] = updated;
      doSaveReviews(result);
      success = true;
      return result;
    });

    if (success) {
      addReviewActivity('reply_added', commentId, commentNumber, content);
    }

    return success;
  }

  function exportReviews(): string {
    const data: ReviewExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      reviewComments: get(reviewComments),
      reviewUsers: getAllReviewUsers()
    };
    return JSON.stringify(data, null, 2);
  }

  function importReviews(json: string): boolean {
    try {
      const data = JSON.parse(json) as ReviewExportData;
      if (!data.reviewComments || !Array.isArray(data.reviewComments)) return false;

      const existingComments = get(reviewComments);
      const existingIds = new Set(existingComments.map(c => c.id));
      let maxNum = get(lastCommentNumber);
      const merged: ReviewComment[] = [...existingComments];

      for (const c of data.reviewComments) {
        if (!existingIds.has(c.id)) {
          if (!c.commentNumber) {
            maxNum++;
            merged.push({ ...c, commentNumber: maxNum });
          } else {
            if (c.commentNumber > maxNum) maxNum = c.commentNumber;
            merged.push(c);
          }
        }
      }

      lastCommentNumber.set(maxNum);
      reviewComments.set(merged);
      doSaveReviews(merged);

      if (data.reviewUsers && Array.isArray(data.reviewUsers)) {
        for (const u of data.reviewUsers) {
          registerReviewUser(u);
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function exportReviewsWithVersions(): string {
    const versionData = doExportVersions(get(versions));
    const reviewData: ReviewExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      reviewComments: get(reviewComments),
      reviewUsers: getAllReviewUsers()
    };
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      versions: JSON.parse(versionData),
      reviews: reviewData
    }, null, 2);
  }

  function importReviewsWithVersions(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (data.versions) {
        const imported = doImportVersions(JSON.stringify(data.versions));
        if (imported) {
          const existing = get(versions);
          const existingIds = new Set(existing.map(v => v.id));
          const merged = [...existing];
          let nextNum = getNextVersionNumber();
          for (const v of imported) {
            if (!existingIds.has(v.id)) {
              nextNum++;
              merged.push({ ...v, id: generateId(), versionNumber: nextNum });
            }
          }
          versions.set(merged);
          saveVersions(merged);
        }
      }
      if (data.reviews) {
        return importReviews(JSON.stringify(data.reviews));
      }
      return true;
    } catch {
      return false;
    }
  }

  function getAllCategories(): string[] {
    const cats = new Set<string>();
    for (const c of get(reviewComments)) {
      if (c.category) cats.add(c.category);
    }
    return Array.from(cats).sort();
  }

  function deleteReviewComment(commentId: string): boolean {
    let success = false;
    reviewComments.update(($comments) => {
      const filtered = $comments.filter(c => c.id !== commentId);
      if (filtered.length === $comments.length) return $comments;
      doSaveReviews(filtered);
      success = true;
      return filtered;
    });

    if (get(selectedReviewCommentId) === commentId) {
      selectedReviewCommentId.set(null);
    }
    return success;
  }

  function setSelectedReviewComment(commentId: string | null): void {
    selectedReviewCommentId.set(commentId);
  }

  function setReviewFilterStatus(status: ReviewStatus | 'all'): void {
    reviewFilterStatus.set(status);
  }

  function setReviewFilterUserId(userId: string | null): void {
    reviewFilterUserId.set(userId);
  }

  function toggleShowPlaybackComments(): void {
    showPlaybackComments.update(v => !v);
  }

  function resolveReviewCommentWithVersion(commentId: string, versionId: string, note?: string): boolean {
    const user = ensureDefaultReviewUser();
    const resolveNote = note || `已在新版本中解决此问题`;
    const success = updateReviewCommentStatus(commentId, 'resolved', resolveNote);
    if (success) {
      reviewComments.update(($comments) => {
        const idx = $comments.findIndex(c => c.id === commentId);
        if (idx === -1) return $comments;
        const result = [...$comments];
        result[idx] = {
          ...result[idx],
          resolvedVersionId: versionId,
          resolvedBy: user.id,
          resolvedByName: user.name,
          resolveNote
        };
        doSaveReviews(result);
        return result;
      });

      addReviewActivity('version_resolved', commentId, 0, resolveNote, {
        versionId,
        newStatus: 'resolved'
      });
    }
    return success;
  }

  function getReviewCommentsForVersion(versionId: string): ReviewComment[] {
    const $comments = get(reviewComments);
    return $comments.filter(c => c.versionId === versionId);
  }

  function getReviewCommentsForDiff(versionAId: string, versionBId: string): ReviewComment[] {
    const $comments = get(reviewComments);
    const versionIds = new Set([versionAId, versionBId]);
    return $comments.filter(c => versionIds.has(c.versionId));
  }

  function clearAllReviews(): void {
    doClearReviews();
    reviewComments.set([]);
    selectedReviewCommentId.set(null);
    clearReviewSelection();
  }

  function addReviewActivity(
    type: ReviewActivityType,
    commentId: string,
    commentNumber: number,
    content: string,
    metadata?: ReviewActivity['metadata']
  ): void {
    const user = get(currentReviewUser) || ensureDefaultReviewUser();
    const activity: ReviewActivity = {
      id: generateId(),
      type,
      commentId,
      commentNumber,
      userId: user.id,
      userName: user.name,
      userColor: user.color || REVIEW_USER_COLORS[0],
      userRole: user.role,
      content,
      createdAt: new Date().toISOString(),
      metadata
    };
    reviewActivities.update(($acts) => {
      const updated = [activity, ...$acts].slice(0, 500);
      return updated;
    });
  }

  function parseMentions(text: string): ReviewMention[] {
    const mentions: ReviewMention[] = [];
    const regex = /@(\S+)/g;
    let match: RegExpExecArray | null;
    const allUsers = getAllReviewUsers();
    while ((match = regex.exec(text)) !== null) {
      const mentionName = match[1];
      const foundUser = allUsers.find(u => u.name === mentionName);
      if (foundUser) {
        mentions.push({
          userId: foundUser.id,
          userName: foundUser.name,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }
    return mentions;
  }

  function getReviewActivities(limit: number = 50): ReviewActivity[] {
    return get(reviewActivities).slice(0, limit);
  }

  function getActivitiesForComment(commentId: string): ReviewActivity[] {
    return get(reviewActivities).filter(a => a.commentId === commentId);
  }

  function getClosureMetrics(): ReviewClosureMetrics {
    const $comments = get(reviewComments);
    const $versions = get(versions);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const metrics: ReviewClosureMetrics = {
      totalComments: $comments.length,
      pendingCount: 0,
      inProgressCount: 0,
      resolvedCount: 0,
      verifiedCount: 0,
      closedCount: 0,
      rejectedCount: 0,
      closureRate: 0,
      avgResolutionTimeMs: 0,
      criticalOpen: 0,
      highOpen: 0,
      byCategory: {},
      byUser: {},
      recentActivityCount: 0
    };

    let totalResolutionTime = 0;
    let resolvedWithTimeCount = 0;

    for (const c of $comments) {
      switch (c.status) {
        case 'pending': metrics.pendingCount++; break;
        case 'in_progress': metrics.inProgressCount++; break;
        case 'resolved': metrics.resolvedCount++; break;
        case 'verified': metrics.verifiedCount++; break;
        case 'closed': metrics.closedCount++; break;
        case 'rejected': metrics.rejectedCount++; break;
      }

      if ((c.status === 'pending' || c.status === 'in_progress') && c.priority === 'critical') {
        metrics.criticalOpen++;
      }
      if ((c.status === 'pending' || c.status === 'in_progress') && c.priority === 'high') {
        metrics.highOpen++;
      }

      if ((c.status === 'resolved' || c.status === 'verified' || c.status === 'closed') && c.resolvedAt && c.createdAt) {
        const resolutionTime = new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime();
        if (resolutionTime > 0) {
          totalResolutionTime += resolutionTime;
          resolvedWithTimeCount++;
        }
      }

      if (c.category) {
        if (!metrics.byCategory[c.category]) {
          metrics.byCategory[c.category] = { total: 0, resolved: 0 };
        }
        metrics.byCategory[c.category].total++;
        if (c.status === 'resolved' || c.status === 'verified' || c.status === 'closed') {
          metrics.byCategory[c.category].resolved++;
        }
      }

      if (!metrics.byUser[c.userId]) {
        metrics.byUser[c.userId] = { name: c.userName, color: c.userColor, total: 0, resolved: 0 };
      }
      metrics.byUser[c.userId].total++;
      if (c.status === 'resolved' || c.status === 'verified' || c.status === 'closed') {
        metrics.byUser[c.userId].resolved++;
      }
    }

    const closedOrResolved = metrics.resolvedCount + metrics.verifiedCount + metrics.closedCount + metrics.rejectedCount;
    metrics.closureRate = metrics.totalComments > 0 ? closedOrResolved / metrics.totalComments : 0;
    metrics.avgResolutionTimeMs = resolvedWithTimeCount > 0 ? totalResolutionTime / resolvedWithTimeCount : 0;

    const recentThreshold = now - oneDayMs;
    metrics.recentActivityCount = get(reviewActivities).filter(
      a => new Date(a.createdAt).getTime() > recentThreshold
    ).length;

    return metrics;
  }

  function getTraceabilityLinks(): ReviewTraceabilityLink[] {
    const $comments = get(reviewComments);
    const $versions = get(versions);
    const versionMap = new Map($versions.map(v => [v.id, v]));
    const links: ReviewTraceabilityLink[] = [];

    for (const c of $comments) {
      const sourceVersion = versionMap.get(c.versionId);
      const resolvedVersion = c.resolvedVersionId ? versionMap.get(c.resolvedVersionId) : undefined;
      const isResolved = c.status === 'resolved' || c.status === 'verified' || c.status === 'closed';

      links.push({
        commentId: c.id,
        commentNumber: c.commentNumber,
        commentContent: c.content,
        commentStatus: c.status,
        commentPriority: c.priority,
        commentUserId: c.userId,
        commentUserName: c.userName,
        commentUserColor: c.userColor,
        sourceVersionId: c.versionId,
        sourceVersionNumber: sourceVersion?.versionNumber ?? 0,
        resolvedVersionId: c.resolvedVersionId,
        resolvedVersionNumber: resolvedVersion?.versionNumber,
        resolutionNote: c.resolveNote,
        isResolved
      });
    }

    return links.sort((a, b) => a.sourceVersionNumber - b.sourceVersionNumber);
  }

  function getTraceabilityForVersion(versionId: string): ReviewTraceabilityLink[] {
    return getTraceabilityLinks().filter(
      l => l.sourceVersionId === versionId || l.resolvedVersionId === versionId
    );
  }

  function getUserCollaborationSummary(): {
    users: Array<ReviewUser & { commentCount: number; replyCount: number; resolvedCount: number; lastActiveAt: string | null }>;
    totalInteractions: number;
    crossUserReplies: number;
  } {
    const $comments = get(reviewComments);
    const $activities = get(reviewActivities);
    const userMap = new Map<string, ReviewUser & { commentCount: number; replyCount: number; resolvedCount: number; lastActiveAt: string | null }>();

    for (const u of getAllReviewUsers()) {
      userMap.set(u.id, { ...u, commentCount: 0, replyCount: 0, resolvedCount: 0, lastActiveAt: null });
    }

    let totalInteractions = 0;
    let crossUserReplies = 0;

    for (const c of $comments) {
      if (!userMap.has(c.userId)) {
        userMap.set(c.userId, {
          id: c.userId, name: c.userName, role: c.userRole, color: c.userColor,
          commentCount: 0, replyCount: 0, resolvedCount: 0, lastActiveAt: null
        });
      }
      const userEntry = userMap.get(c.userId)!;
      userEntry.commentCount++;
      totalInteractions++;

      if (c.status === 'resolved' || c.status === 'verified' || c.status === 'closed') {
        userEntry.resolvedCount++;
      }

      const cTime = new Date(c.createdAt).getTime();
      if (!userEntry.lastActiveAt || cTime > new Date(userEntry.lastActiveAt).getTime()) {
        userEntry.lastActiveAt = c.createdAt;
      }

      for (const r of c.replies) {
        if (!userMap.has(r.userId)) {
          userMap.set(r.userId, {
            id: r.userId, name: r.userName, role: r.userRole, color: r.userColor || REVIEW_USER_COLORS[0],
            commentCount: 0, replyCount: 0, resolvedCount: 0, lastActiveAt: null
          });
        }
        const replyUser = userMap.get(r.userId)!;
        replyUser.replyCount++;
        totalInteractions++;

        if (r.userId !== c.userId) {
          crossUserReplies++;
        }

        const rTime = new Date(r.createdAt).getTime();
        if (!replyUser.lastActiveAt || rTime > new Date(replyUser.lastActiveAt).getTime()) {
          replyUser.lastActiveAt = r.createdAt;
        }
      }
    }

    return {
      users: Array.from(userMap.values()),
      totalInteractions,
      crossUserReplies
    };
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

    if (get(versions).length === 0) {
      createVersion('初始示例方案 - 主帆穿绕索');
    }
  }

  return {
    versions,
    viewingVersionId,
    compareVersionAId,
    compareVersionBId,
    currentDiff,
    playbackSteps,
    playbackIndex,
    isPlaybackMode,
    playbackRopeId,
    reviewComments,
    currentReviewUser,
    reviewSelection,
    isReviewSelectionActive,
    selectedReviewCommentId,
    reviewFilterStatus,
    reviewFilterUserId,
    showPlaybackComments,
    diffFilterCommentId,
    reviewFilterPriority,
    reviewFilterCategory,
    newReviewCommentPriority,
    newReviewCommentCategory,
    reviewUsersRegistry,
    lastCommentNumber,
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
    clearSavedScheme,
    createVersion,
    deleteVersion,
    clearAllVersions,
    viewVersion,
    exitViewVersion,
    setCompareVersionA,
    setCompareVersionB,
    clearCompare,
    startPlayback,
    nextPlaybackStep,
    prevPlaybackStep,
    goToPlaybackStep,
    stopPlayback,
    exportAllVersions,
    importAllVersions,
    loadVersionsFromStorage,
    loadReviewsFromStorage,
    persistReviews,
    setCurrentReviewUser,
    ensureDefaultReviewUser,
    startReviewSelection,
    addNodeToReviewSelection,
    addRopeToReviewSelection,
    removeNodeFromReviewSelection,
    removeRopeFromReviewSelection,
    clearReviewSelection,
    cancelReviewSelection,
    createReviewComment,
    updateReviewCommentStatus,
    addReviewCommentReply,
    deleteReviewComment,
    setSelectedReviewComment,
    setReviewFilterStatus,
    setReviewFilterUserId,
    toggleShowPlaybackComments,
    resolveReviewCommentWithVersion,
    getReviewCommentsForVersion,
    getReviewCommentsForDiff,
    clearAllReviews,
    setDiffFilterCommentId,
    setReviewFilterPriority,
    setReviewFilterCategory,
    setNewReviewCommentPriority,
    setNewReviewCommentCategory,
    getFilteredDiffForComment,
    getRelatedCommentsForDiffItem,
    getVersionDiffForComment,
    verifyReviewComment,
    closeReviewComment,
    reopenReviewComment,
    updateReviewCommentPriority,
    updateReviewCommentCategory,
    exportReviews,
    importReviews,
    exportReviewsWithVersions,
    importReviewsWithVersions,
    getAllCategories,
    getAllReviewUsers,
    registerReviewUser,
    reviewActivities,
    addReviewActivity,
    parseMentions,
    getReviewActivities,
    getActivitiesForComment,
    getClosureMetrics,
    getTraceabilityLinks,
    getTraceabilityForVersion,
    getUserCollaborationSummary
  };
}

export const editorStore = createEditorStore();
