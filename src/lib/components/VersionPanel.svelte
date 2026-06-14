<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import type {
    VersionSnapshot,
    VersionDiff,
    NodeDiff,
    RopeDiff,
    ReviewComment,
    ReviewStatus,
    ReviewUser,
    ReviewSelection,
    ReviewPriority,
    ReviewActivity,
    ReviewActivityType,
    ReviewTraceabilityLink,
    ReviewClosureMetrics
  } from '$lib/types';
  import {
    NODE_TYPE_LABELS,
    PULLEY_DIRECTION_LABELS,
    NODE_TYPE_COLORS,
    REVIEW_STATUS_LABELS,
    REVIEW_STATUS_COLORS,
    REVIEW_STATUS_FLOW_ORDER,
    REVIEW_USER_ROLE_LABELS,
    REVIEW_USER_COLORS,
    REVIEW_PRIORITY_LABELS,
    REVIEW_PRIORITY_COLORS,
    REVIEW_PRIORITY_BADGE,
    REVIEW_CATEGORIES,
    PRESET_REVIEW_USERS,
    REVIEW_ACTIVITY_LABELS,
    REVIEW_ACTIVITY_ICONS
  } from '$lib/types';

  const store = editorStore;
  const {
    versions,
    viewingVersionId,
    compareVersionAId,
    compareVersionBId,
    currentDiff,
    playbackSteps,
    playbackIndex,
    isPlaybackMode,
    viewVersion,
    exitViewVersion,
    setCompareVersionA,
    setCompareVersionB,
    clearCompare,
    deleteVersion,
    clearAllVersions,
    startPlayback,
    nextPlaybackStep,
    prevPlaybackStep,
    goToPlaybackStep,
    stopPlayback,
    createVersion,
    exportAllVersions,
    importAllVersions,
    canSaveScheme,
    selectedRopeId,
    reviewComments,
    currentReviewUser,
    reviewSelection,
    isReviewSelectionActive,
    selectedReviewCommentId,
    reviewFilterStatus,
    reviewFilterUserId,
    showPlaybackComments,
    setCurrentReviewUser,
    ensureDefaultReviewUser,
    startReviewSelection,
    cancelReviewSelection,
    clearReviewSelection,
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
    diffFilterCommentId,
    reviewFilterPriority,
    reviewFilterCategory,
    newReviewCommentPriority,
    newReviewCommentCategory,
    setDiffFilterCommentId,
    setReviewFilterPriority,
    setReviewFilterCategory,
    setNewReviewCommentPriority,
    setNewReviewCommentCategory,
    getFilteredDiffForComment,
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
    reviewActivities,
    addReviewActivity,
    getReviewActivities,
    getActivitiesForComment,
    getClosureMetrics,
    getTraceabilityLinks,
    getTraceabilityForVersion,
    getUserCollaborationSummary
  } = store;

  type SubTab = 'dashboard' | 'list' | 'compare' | 'playback' | 'review';
  let activeSubTab = $state<SubTab>('dashboard');
  let newVersionNote = $state('');
  let showCreateModal = $state(false);
  let playbackAutoPlay = $state(false);
  let playbackSpeed = $state(2000);
  let autoPlayTimer: number | null = null;

  let newCommentContent = $state('');
  let showUserModal = $state(false);
  let tempUserName = $state('');
  let tempUserRole: ReviewUser['role'] = $state('reviewer');
  let expandedCommentId = $state<string | null>(null);
  let replyInputMap = $state<Record<string, string>>({});
  let showResolveWithVersionModal = $state(false);
  let resolvingCommentId = $state<string | null>(null);
  let resolvingVersionId = $state<string | null>(null);
  let resolveNote = $state('');
  let showExportReviewModal = $state(false);
  let showImportReviewModal = $state(false);
  let showPresetUserPanel = $state(false);
  let dashboardActivityLimit = $state(20);

  const currentVersions = $derived($versions ?? []);
  const sortedVersions = $derived(
    [...currentVersions].sort((a, b) => b.versionNumber - a.versionNumber)
  );
  const currentViewingId = $derived($viewingVersionId ?? null);
  const currentCompareAId = $derived($compareVersionAId ?? null);
  const currentCompareBId = $derived($compareVersionBId ?? null);
  const diff = $derived($currentDiff ?? null);
  const currentPlaybackSteps = $derived($playbackSteps ?? []);
  const currentPlaybackIndex = $derived($playbackIndex ?? -1);
  const currentIsPlayback = $derived($isPlaybackMode ?? false);
  const currentCanSave = $derived($canSaveScheme ?? false);
  const currentSelectedRopeId = $derived($selectedRopeId ?? null);

  const currentReviewComments = $derived($reviewComments ?? []);
  const currentUser = $derived($currentReviewUser ?? null);
  const currentReviewSelection = $derived($reviewSelection);
  const currentIsReviewSelectionActive = $derived($isReviewSelectionActive ?? false);
  const currentSelectedReviewCommentId = $derived($selectedReviewCommentId ?? null);
  const currentReviewFilterStatus = $derived($reviewFilterStatus ?? 'all');
  const currentReviewFilterUserId = $derived($reviewFilterUserId ?? null);
  const currentShowPlaybackComments = $derived($showPlaybackComments ?? true);
  const currentDiffFilterCommentId = $derived($diffFilterCommentId ?? null);
  const currentReviewFilterPriority = $derived($reviewFilterPriority ?? 'all');
  const currentReviewFilterCategory = $derived($reviewFilterCategory ?? 'all');
  const currentNewCommentPriority = $derived($newReviewCommentPriority ?? 'medium');
  const currentNewCommentCategory = $derived($newReviewCommentCategory ?? '');

  const sortedComments = $derived(
    [...currentReviewComments].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  );

  const filteredComments = $derived.by(() => {
    let list = sortedComments;
    if (currentReviewFilterStatus !== 'all') {
      list = list.filter(c => c.status === currentReviewFilterStatus);
    }
    if (currentReviewFilterUserId) {
      list = list.filter(c => c.userId === currentReviewFilterUserId);
    }
    if (currentReviewFilterPriority !== 'all') {
      list = list.filter(c => c.priority === currentReviewFilterPriority);
    }
    if (currentReviewFilterCategory !== 'all') {
      list = list.filter(c => c.category === currentReviewFilterCategory);
    }
    return list;
  });

  const allCategories = $derived.by(() => getAllCategories());
  const allReviewUsers = $derived.by(() => getAllReviewUsers());

  const filteredDiffForSelectedComment = $derived.by(() => {
    if (!diff || !currentDiffFilterCommentId) return null;
    return getFilteredDiffForComment(diff, currentDiffFilterCommentId);
  });

  const reviewCommentStatsDetailed = $derived.by(() => {
    const stats: Record<string, number> = {
      total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0, verified: 0, closed: 0,
      critical: 0, high: 0, medium: 0, low: 0
    };
    for (const c of currentReviewComments) {
      stats.total++;
      stats[c.status]++;
      stats[c.priority]++;
    }
    return stats;
  });

  const uniqueReviewers = $derived.by(() => {
    const users = new Map<string, { id: string; name: string; color?: string; role: ReviewUser['role'] }>();
    for (const c of currentReviewComments) {
      users.set(c.userId, { id: c.userId, name: c.userName, color: c.userColor, role: c.userRole });
    }
    return Array.from(users.values());
  });

  const currentVersionForComment = $derived.by(() => {
    if (currentViewingId) return currentViewingId;
    if (currentIsPlayback && currentPlaybackIndex >= 0) {
      return currentPlaybackSteps[currentPlaybackIndex]?.snapshot.id || null;
    }
    return null;
  });

  const reviewCommentStats = $derived.by(() => {
    const stats: Record<string, number> = { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 };
    for (const c of currentReviewComments) {
      stats.total++;
      stats[c.status]++;
    }
    return stats;
  });

  const commentsForCurrentDiff = $derived.by(() => {
    if (!diff) return [] as ReviewComment[];
    return getReviewCommentsForDiff(diff.versionAId, diff.versionBId);
  });

  const commentsForCurrentPlayback = $derived.by(() => {
    if (!currentIsPlayback || currentPlaybackIndex < 0) return [] as ReviewComment[];
    const step = currentPlaybackSteps[currentPlaybackIndex];
    if (!step) return [] as ReviewComment[];
    const vid = step.snapshot.id;
    const result: ReviewComment[] = [];
    for (const c of currentReviewComments) {
      if (c.versionId === vid || c.resolvedVersionId === vid) {
        result.push(c);
      }
    }
    return result;
  });

  const closureMetrics = $derived.by(() => getClosureMetrics());
  const recentActivities = $derived.by(() => getReviewActivities(dashboardActivityLimit));
  const collaborationSummary = $derived.by(() => getUserCollaborationSummary());
  const traceabilityLinks = $derived.by(() => getTraceabilityLinks());

  const dashboardStats = $derived.by(() => {
    const m = closureMetrics;
    return {
      total: m.totalComments,
      open: m.pendingCount + m.inProgressCount,
      closed: m.resolvedCount + m.verifiedCount + m.closedCount + m.rejectedCount,
      rate: m.closureRate,
      avgTime: m.avgResolutionTimeMs,
      criticalOpen: m.criticalOpen,
      highOpen: m.highOpen
    };
  });

  function formatDateTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function getChangeTypeLabel(type: string): string {
    switch (type) {
      case 'added': return '新增';
      case 'removed': return '删除';
      case 'modified': return '修改';
      default: return type;
    }
  }

  function getChangeTypeColor(type: string): string {
    switch (type) {
      case 'added': return 'text-green-600 bg-green-50';
      case 'removed': return 'text-red-600 bg-red-50';
      case 'modified': return 'text-amber-600 bg-amber-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  }

  function getChangeTypeBorder(type: string): string {
    switch (type) {
      case 'added': return 'border-l-4 border-green-500';
      case 'removed': return 'border-l-4 border-red-500';
      case 'modified': return 'border-l-4 border-amber-500';
      default: return '';
    }
  }

  function getNodeTypeLabel(node: any): string {
    return NODE_TYPE_LABELS[node?.type] || '';
  }

  function handleViewVersion(versionId: string) {
    if (currentIsPlayback) return;
    if (currentViewingId === versionId) {
      exitViewVersion();
    } else {
      viewVersion(versionId);
    }
  }

  function handleSelectCompareA(versionId: string) {
    if (currentCompareAId === versionId) {
      setCompareVersionA(null);
    } else {
      setCompareVersionA(versionId);
    }
  }

  function handleSelectCompareB(versionId: string) {
    if (currentCompareBId === versionId) {
      setCompareVersionB(null);
    } else {
      setCompareVersionB(versionId);
    }
  }

  function handleDeleteVersion(e: Event, versionId: string) {
    e.stopPropagation();
    if (confirm('确定要删除此版本吗？此操作不可撤销。')) {
      deleteVersion(versionId);
    }
  }

  function handleClearAllVersions() {
    if (confirm('确定要清空所有版本历史吗？此操作不可撤销。')) {
      clearAllVersions();
    }
  }

  function handleCreateVersion() {
    if (!currentCanSave) {
      alert('方案存在错误，请修复后再创建版本');
      return;
    }
    const snapshot = createVersion(newVersionNote.trim());
    if (snapshot) {
      newVersionNote = '';
      showCreateModal = false;
    } else {
      alert('创建版本失败');
    }
  }

  function handleStartPlayback() {
    if (sortedVersions.length < 2) {
      alert('至少需要2个版本才能进行回放');
      return;
    }
    startPlayback(currentSelectedRopeId || undefined);
    activeSubTab = 'playback';
  }

  function handleStopPlayback() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    playbackAutoPlay = false;
    stopPlayback();
  }

  function toggleAutoPlay() {
    playbackAutoPlay = !playbackAutoPlay;
    if (playbackAutoPlay) {
      autoPlayTimer = window.setInterval(() => {
        if (!nextPlaybackStep()) {
          if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
          }
          playbackAutoPlay = false;
        }
      }, playbackSpeed);
    } else {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
      }
    }
  }

  function handleExportVersions() {
    const data = exportAllVersions();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rope-versions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportVersions() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const success = importAllVersions(content);
        if (!success) {
          alert('导入失败：文件格式不正确');
        }
      };
    };
    reader.readAsText(file);
    input.click();
  }

  function getVersionById(id: string): VersionSnapshot | undefined {
    return currentVersions.find(v => v.id === id);
  }

  function renderNodeDiff(nd: NodeDiff) {
    const parts: string[] = [];
    if (nd.changedFields) {
      for (const f of nd.changedFields) {
        if (f === 'position' && nd.oldNode && nd.newNode) {
          const dx = nd.newNode.position.x - nd.oldNode.position.x;
          const dy = nd.newNode.position.y - nd.oldNode.position.y;
          parts.push(`位置偏移(${dx > 0 ? '+' : ''}${dx.toFixed(0)}, ${dy > 0 ? '+' : ''}${dy.toFixed(0)})`);
        } else if (f === 'direction' && nd.newNode?.type === 'pulley') {
          parts.push(`方向变更`);
        } else if (f === 'active' && nd.newNode?.type === 'pulley') {
          parts.push(`启用状态变更`);
        } else if (f === 'label') {
          parts.push('标签变更');
        } else if (f === 'number') {
          parts.push('编号变更');
        } else {
          parts.push(f);
        }
      }
    }
    return parts.join('、');
  }

  function renderRopeDiff(rd: RopeDiff) {
    const parts: string[] = [];
    if (rd.changedFields) {
      for (const f of rd.changedFields) {
        if (f === 'tension' && rd.oldRope && rd.newRope) {
          const delta = rd.newRope.tension - rd.oldRope.tension;
          parts.push(`张力${delta > 0 ? '+' : ''}${delta.toFixed(0)}N`);
        } else if (f === 'totalLength' && rd.oldRope && rd.newRope) {
          const delta = rd.newRope.totalLength - rd.oldRope.totalLength;
          parts.push(`长度${delta > 0 ? '+' : ''}${delta.toFixed(1)}m`);
        } else if (f === 'color') {
          parts.push('颜色变更');
        } else if (f === 'label') {
          parts.push('标签变更');
        } else if (f === 'nodePath') {
          parts.push('穿绕路径变更');
        } else {
          parts.push(f);
        }
      }
    }
    return parts.join('、');
  }

  function getNodeLabelById(nodeId: string, versionId?: string): string {
    let nodes: VersionSnapshot['nodes'] | null = null;
    if (versionId) {
      const v = getVersionById(versionId);
      if (v) nodes = v.nodes;
    }
    if (!nodes) {
      const v = getVersionById(currentViewingId || '');
      if (v) nodes = v.nodes;
    }
    if (nodes) {
      const n = nodes.find(x => x.id === nodeId);
      if (n) return n.label;
    }
    return nodeId.substring(0, 8);
  }

  function getRopeLabelById(ropeId: string, versionId?: string): string {
    let ropes: VersionSnapshot['ropes'] | null = null;
    if (versionId) {
      const v = getVersionById(versionId);
      if (v) ropes = v.ropes;
    }
    if (!ropes) {
      const v = getVersionById(currentViewingId || '');
      if (v) ropes = v.ropes;
    }
    if (ropes) {
      const r = ropes.find(x => x.id === ropeId);
      if (r) return r.label;
    }
    return ropeId.substring(0, 8);
  }

  function formatReviewSelection(sel: ReviewSelection, versionId?: string): string {
    const parts: string[] = [];
    if (sel.nodeIds && sel.nodeIds.length > 0) {
      const labels = sel.nodeIds.map(id => getNodeLabelById(id, versionId));
      parts.push(`节点：${labels.join('、')}`);
    }
    if (sel.ropeIds && sel.ropeIds.length > 0) {
      const labels = sel.ropeIds.map(id => getRopeLabelById(id, versionId));
      parts.push(`缆绳：${labels.join('、')}`);
    }
    if (parts.length === 0) return '全局意见';
    return parts.join(' · ');
  }

  function getSelectionTargetIds(sel: ReviewSelection): { nodeIds: string[]; ropeIds: string[] } {
    return {
      nodeIds: sel.nodeIds || [],
      ropeIds: sel.ropeIds || []
    };
  }

  function diffIsRelatedToComment(diffType: 'node' | 'rope', id: string, comment: ReviewComment): boolean {
    const targets = getSelectionTargetIds(comment.selection);
    if (diffType === 'node') return targets.nodeIds.includes(id);
    if (diffType === 'rope') return targets.ropeIds.includes(id);
    return false;
  }

  function getCommentsForDiffItem(diffType: 'node' | 'rope', id: string): ReviewComment[] {
    const result: ReviewComment[] = [];
    for (const c of commentsForCurrentDiff) {
      if (diffIsRelatedToComment(diffType, id, c)) {
        result.push(c);
      }
    }
    return result;
  }

  function handleCreateReviewComment() {
    const content = newCommentContent.trim();
    if (!content) {
      alert('请输入评论内容');
      return;
    }
    ensureDefaultReviewUser();
    let versionToUse: string | undefined = currentVersionForComment || undefined;
    const comment = createReviewComment(content, versionToUse);
    if (comment) {
      newCommentContent = '';
      clearReviewSelection();
      startReviewSelection.set?.(false);
      if (typeof isReviewSelectionActive !== 'undefined' && typeof isReviewSelectionActive !== 'boolean') {
        (isReviewSelectionActive as any).set(false);
      }
    } else {
      if (!currentVersionForComment && currentReviewSelection.targetType !== 'general') {
        alert('请先查看某个版本，再针对节点/缆绳添加批注');
      } else {
        alert('创建批注失败');
      }
    }
  }

  function openUserModal() {
    if (currentUser) {
      tempUserName = currentUser.name;
      tempUserRole = currentUser.role;
    } else {
      tempUserName = '';
      tempUserRole = 'reviewer';
    }
    showUserModal = true;
  }

  function saveUserProfile() {
    if (!tempUserName.trim()) {
      alert('请输入用户名');
      return;
    }
    const colorIdx = Math.floor(Math.random() * REVIEW_USER_COLORS.length);
    const user: ReviewUser = {
      id: currentUser?.id || ('user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
      name: tempUserName.trim(),
      role: tempUserRole,
      color: currentUser?.color || REVIEW_USER_COLORS[colorIdx]
    };
    setCurrentReviewUser(user);
    showUserModal = false;
  }

  function toggleCommentExpand(commentId: string) {
    expandedCommentId = expandedCommentId === commentId ? null : commentId;
  }

  function handleSelectComment(comment: ReviewComment) {
    setSelectedReviewComment(currentSelectedReviewCommentId === comment.id ? null : comment.id);
  }

  function handleChangeStatus(commentId: string, status: ReviewStatus) {
    const note = prompt(`请输入状态变更说明（可选）：将状态改为「${REVIEW_STATUS_LABELS[status]}」`, '');
    if (note === null) return;
    updateReviewCommentStatus(commentId, status, note || undefined);
  }

  function handleSendReply(commentId: string) {
    const content = (replyInputMap[commentId] || '').trim();
    if (!content) return;
    const success = addReviewCommentReply(commentId, content);
    if (success) {
      replyInputMap[commentId] = '';
    }
  }

  function handleDeleteComment(commentId: string) {
    if (!confirm('确定删除此批注？所有回复也将一并删除。')) return;
    deleteReviewComment(commentId);
  }

  function handleJumpToVersion(versionId: string) {
    if (currentIsPlayback) return;
    viewVersion(versionId);
  }

  function openResolveWithVersion(commentId: string) {
    resolvingCommentId = commentId;
    resolvingVersionId = sortedVersions[0]?.id || null;
    resolveNote = '';
    showResolveWithVersionModal = true;
  }

  function confirmResolveWithVersion() {
    if (!resolvingCommentId || !resolvingVersionId) return;
    const c = currentReviewComments.find(x => x.id === resolvingCommentId);
    const v = getVersionById(resolvingVersionId);
    if (!c || !v) return;
    if (!confirm(`确认将批注「${c.content.substring(0, 20)}...」标记为在 v${v.versionNumber} 版本中解决？`)) return;
    resolveReviewCommentWithVersion(resolvingCommentId, resolvingVersionId, resolveNote.trim() || undefined);
    showResolveWithVersionModal = false;
    resolvingCommentId = null;
  }

  function filterCommentsByStatus(status: ReviewStatus | 'all') {
    setReviewFilterStatus(status);
  }

  function filterCommentsByUser(userId: string | null) {
    setReviewFilterUserId(userId);
  }

  function handleClearAllReviews() {
    if (!confirm('确定清空所有评审批注？此操作不可撤销！')) return;
    clearAllReviews();
  }

  function filterCommentsByPriority(priority: ReviewPriority | 'all') {
    setReviewFilterPriority(priority);
  }

  function filterCommentsByCategory(category: string | 'all') {
    setReviewFilterCategory(category);
  }

  function handleSelectPresetUser(user: ReviewUser) {
    setCurrentReviewUser({ ...user });
    showPresetUserPanel = false;
  }

  function handleVerifyComment(commentId: string) {
    const note = prompt('验证确认说明（可选）：');
    if (note !== null) {
      verifyReviewComment(commentId, note || undefined);
    }
  }

  function handleCloseComment(commentId: string) {
    const note = prompt('归档说明（可选）：');
    if (note !== null) {
      closeReviewComment(commentId, note || undefined);
    }
  }

  function handleReopenComment(commentId: string) {
    const note = prompt('重新打开说明（可选）：');
    if (note !== null) {
      reopenReviewComment(commentId, note || undefined);
    }
  }

  function handleChangePriority(commentId: string, priority: ReviewPriority) {
    updateReviewCommentPriority(commentId, priority);
  }

  function handleChangeCategory(commentId: string) {
    const currentCat = currentReviewComments.find(c => c.id === commentId)?.category || '';
    const input = prompt('请输入分类（留空清除）：', currentCat);
    if (input !== null) {
      updateReviewCommentCategory(commentId, input.trim());
    }
  }

  function handleJumpFromCommentToDiff(comment: ReviewComment) {
    const { fromVersion, toVersion } = getVersionDiffForComment(comment.id);
    if (fromVersion && toVersion) {
      setCompareVersionA(fromVersion.id);
      setCompareVersionB(toVersion.id);
      setDiffFilterCommentId(comment.id);
      activeSubTab = 'compare';
      setSelectedReviewComment(null);
    } else {
      alert('无法确定此批注对应的版本对比范围，请先选择解决版本。');
    }
  }

  function handleClearDiffFilter() {
    setDiffFilterCommentId(null);
  }

  function handleExportReviewsWithVersions() {
    const data = exportReviewsWithVersions();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rope-reviews-versions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportReviewsWithVersions() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const success = importReviewsWithVersions(content);
        if (!success) {
          alert('导入失败：文件格式不正确');
        } else {
          alert('导入成功！');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function getClosureProgress(comment: ReviewComment): number {
    if (comment.status === 'closed') return 100;
    if (comment.status === 'verified') return 85;
    if (comment.status === 'resolved') return 70;
    if (comment.status === 'in_progress') return 40;
    if (comment.status === 'rejected') return 100;
    return 10;
  }

  function getClosureProgressColor(comment: ReviewComment): string {
    if (comment.status === 'rejected') return '#9CA3AF';
    if (comment.status === 'closed' || comment.status === 'verified') return '#10B981';
    return '#6366F1';
  }

  function isCommentResolvedInStep(comment: ReviewComment, stepIdx: number): boolean {
    if (comment.resolvedVersionId && stepIdx >= 0 && stepIdx < currentPlaybackSteps.length) {
      const stepVid = currentPlaybackSteps[stepIdx].snapshot.id;
      return comment.resolvedVersionId === stepVid;
    }
    return false;
  }

  function isCommentCreatedInStep(comment: ReviewComment, stepIdx: number): boolean {
    if (stepIdx >= 0 && stepIdx < currentPlaybackSteps.length) {
      const stepVid = currentPlaybackSteps[stepIdx].snapshot.id;
      return comment.versionId === stepVid;
    }
    return false;
  }

  function activeClass(tab: SubTab) {
    return activeSubTab === tab
      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
      : 'text-gray-500 hover:text-gray-700';
  }

  function formatDuration(ms: number): string {
    if (ms <= 0) return '-';
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}天${hours % 24}时`;
    if (hours > 0) return `${hours}时${minutes % 60}分`;
    return `${minutes}分钟`;
  }

  function getActivityDescription(activity: ReviewActivity): string {
    switch (activity.type) {
      case 'comment_created': return `对 #${activity.commentNumber} 提出评审意见`;
      case 'status_changed': return `将 #${activity.commentNumber} 状态改为「${REVIEW_STATUS_LABELS[activity.metadata?.newStatus || 'pending']}」`;
      case 'reply_added': return `回复了 #${activity.commentNumber}`;
      case 'priority_changed': return `将 #${activity.commentNumber} 优先级调整为「${REVIEW_PRIORITY_LABELS[activity.metadata?.newPriority || 'medium']}」`;
      case 'category_changed': return `修改了 #${activity.commentNumber} 的分类`;
      case 'version_resolved': return `在版本中解决了 #${activity.commentNumber}`;
      case 'comment_verified': return `验证确认了 #${activity.commentNumber}`;
      case 'comment_closed': return `归档关闭了 #${activity.commentNumber}`;
      case 'comment_reopened': return `重新打开了 #${activity.commentNumber}`;
      case 'selection_updated': return `更新了 #${activity.commentNumber} 的圈选范围`;
      default: return activity.content;
    }
  }

  function getLifecycleSteps(comment: ReviewComment): Array<{ status: ReviewStatus; label: string; active: boolean; timestamp?: string }> {
    const steps: Array<{ status: ReviewStatus; label: string; active: boolean; timestamp?: string }> = [];
    const statusFlow = REVIEW_STATUS_FLOW_ORDER;
    const currentIdx = statusFlow.indexOf(comment.status);

    for (let i = 0; i < statusFlow.length; i++) {
      const s = statusFlow[i];
      steps.push({
        status: s,
        label: REVIEW_STATUS_LABELS[s],
        active: i <= currentIdx || (comment.status === 'rejected' && s === 'rejected'),
        timestamp: i === 0 ? comment.createdAt
          : s === 'resolved' ? comment.resolvedAt
          : s === 'verified' ? comment.verifiedAt
          : undefined
      });
    }

    if (comment.status === 'rejected') {
      steps.push({
        status: 'rejected',
        label: REVIEW_STATUS_LABELS['rejected'],
        active: true,
        timestamp: comment.replies?.find(r => r.changedStatusTo === 'rejected')?.createdAt
      });
    }

    return steps;
  }

  function renderMentionText(text: string): string {
    return text.replace(/@(\S+)/g, '<span class="text-indigo-600 font-medium">@$1</span>');
  }

  function getClosureRingStroke(rate: number): string {
    if (rate >= 0.8) return '#10B981';
    if (rate >= 0.5) return '#F59E0B';
    return '#EF4444';
  }

  function getTraceabilityStatusIcon(link: ReviewTraceabilityLink): string {
    if (link.commentStatus === 'closed' || link.commentStatus === 'verified') return '✅';
    if (link.commentStatus === 'resolved') return '✓';
    if (link.commentStatus === 'in_progress') return '🔧';
    if (link.commentStatus === 'rejected') return '✕';
    return '⏳';
  }
</script>

<div class="flex flex-col h-full bg-white">
  <div class="flex border-b border-gray-200 overflow-x-auto">
    <button
      type="button"
      onclick={() => activeSubTab = 'dashboard'}
      class="flex-1 py-2 px-1.5 text-xs font-medium transition-colors whitespace-nowrap {activeClass('dashboard')}"
    >
      📊 评审中心
    </button>
    <button
      type="button"
      onclick={() => activeSubTab = 'list'}
      class="flex-1 py-2 px-1.5 text-xs font-medium transition-colors whitespace-nowrap {activeClass('list')}"
    >
      📋 版本列表
    </button>
    <button
      type="button"
      onclick={() => activeSubTab = 'compare'}
      class="flex-1 py-2 px-1.5 text-xs font-medium transition-colors whitespace-nowrap {activeClass('compare')}"
    >
      🔍 差异对比
    </button>
    <button
      type="button"
      onclick={() => activeSubTab = 'playback'}
      class="flex-1 py-2 px-1.5 text-xs font-medium transition-colors whitespace-nowrap {activeClass('playback')}"
    >
      ▶ 时间回放
    </button>
    <button
      type="button"
      onclick={() => activeSubTab = 'review'}
      class="flex-1 py-2 px-1.5 text-xs font-medium transition-colors whitespace-nowrap relative {activeClass('review')}"
    >
      💬 批注列表
      {#if reviewCommentStats.pending > 0}
        <span class="absolute top-0.5 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
          {reviewCommentStats.pending}
        </span>
      {/if}
    </button>
  </div>

  <div class="p-2 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-1">
    {#if activeSubTab !== 'review'}
      {#if !currentIsPlayback}
        <button
          type="button"
          onclick={() => showCreateModal = true}
          class="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
          disabled={!currentCanSave}
          title="创建新版本快照"
        >
          + 新建版本
        </button>
        <button
          type="button"
          onclick={handleStartPlayback}
          class="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors disabled:opacity-50"
          disabled={sortedVersions.length < 2}
          title="启动时间轴回放"
        >
          ▶ 开始回放
        </button>
      {/if}
    {/if}

    {#if activeSubTab === 'review'}
      <button
        type="button"
        onclick={openUserModal}
        class="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors flex items-center gap-1"
        title="设置当前评审身份"
      >
        {#if currentUser}
          <span class="w-3 h-3 rounded-full" style="background-color: {currentUser.color}"></span>
          <span class="truncate max-w-[70px]">{currentUser.name}</span>
        {:else}
          👤 设置身份
        {/if}
      </button>

      {#if !currentIsPlayback && !currentViewingId}
        <button
          type="button"
          onclick={() => { ensureDefaultReviewUser(); startReviewSelection('general'); activeSubTab = 'review'; }}
          class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          title="全局意见（不关联特定元素）"
        >
          📝 全局批注
        </button>
      {/if}
    {/if}

    <button
      type="button"
      onclick={handleExportVersions}
      class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
      disabled={sortedVersions.length === 0}
    >
      导出
    </button>
    <button
      type="button"
      onclick={handleImportVersions}
      class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
    >
      导入
    </button>
    {#if sortedVersions.length > 0 && !currentIsPlayback && activeSubTab !== 'review'}
      <button
        type="button"
        onclick={handleClearAllVersions}
        class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors ml-auto"
      >
        清空
      </button>
    {/if}
    {#if activeSubTab === 'review' && currentReviewComments.length > 0}
      <button
        type="button"
        onclick={handleExportReviewsWithVersions}
        class="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors"
        title="导出评审与版本数据"
      >
        📤 导出评审
      </button>
      <button
        type="button"
        onclick={handleImportReviewsWithVersions}
        class="px-2 py-1 text-xs bg-teal-500 text-white rounded hover:bg-teal-600 transition-colors"
        title="导入评审与版本数据"
      >
        📥 导入评审
      </button>
      <button
        type="button"
        onclick={handleClearAllReviews}
        class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors ml-auto"
      >
        清空批注
      </button>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if activeSubTab === 'dashboard'}
      {@const metrics = closureMetrics}
      {@const stats = dashboardStats}
      {@const activities = recentActivities}
      {@const collab = collaborationSummary}
      {@const links = traceabilityLinks}
      <div class="p-3 space-y-3">
        <div class="text-center py-1">
          <div class="text-sm font-bold text-gray-800">🏛️ 多用户协作评审中心</div>
          <div class="text-[10px] text-gray-500 mt-0.5">方案版本评审闭环追踪</div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div class="col-span-1 flex items-center justify-center">
            <div class="relative w-24 h-24">
              <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#E5E7EB" stroke-width="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={getClosureRingStroke(stats.rate)}
                  stroke-width="8"
                  stroke-dasharray={`${stats.rate * 264} 264`}
                  stroke-linecap="round"
                />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <div class="text-lg font-bold" style="color: {getClosureRingStroke(stats.rate)}">
                  {stats.total > 0 ? Math.round(stats.rate * 100) : 0}%
                </div>
                <div class="text-[9px] text-gray-500">闭环率</div>
              </div>
            </div>
          </div>
          <div class="col-span-2 space-y-1.5">
            <div class="grid grid-cols-2 gap-1.5">
              <div class="p-2 rounded border bg-amber-50 border-amber-200 text-center">
                <div class="text-lg font-bold text-amber-700">{stats.open}</div>
                <div class="text-[9px] text-amber-600">待处理</div>
              </div>
              <div class="p-2 rounded border bg-green-50 border-green-200 text-center">
                <div class="text-lg font-bold text-green-700">{stats.closed}</div>
                <div class="text-[9px] text-green-600">已闭环</div>
              </div>
              <div class="p-2 rounded border bg-red-50 border-red-200 text-center">
                <div class="text-lg font-bold text-red-700">{stats.criticalOpen}</div>
                <div class="text-[9px] text-red-600">紧急待办</div>
              </div>
              <div class="p-2 rounded border bg-blue-50 border-blue-200 text-center">
                <div class="text-sm font-bold text-blue-700">{formatDuration(stats.avgTime)}</div>
                <div class="text-[9px] text-blue-600">平均解决</div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-6 gap-1">
          {#each (['pending', 'in_progress', 'resolved', 'verified', 'closed', 'rejected'] as ReviewStatus[]) as status}
            <div class="p-1.5 rounded border text-center {REVIEW_STATUS_COLORS[status]}">
              <div class="text-sm font-bold">
                {#if status === 'pending'}{metrics.pendingCount}
                {:else if status === 'in_progress'}{metrics.inProgressCount}
                {:else if status === 'resolved'}{metrics.resolvedCount}
                {:else if status === 'verified'}{metrics.verifiedCount}
                {:else if status === 'closed'}{metrics.closedCount}
                {:else}{metrics.rejectedCount}{/if}
              </div>
              <div class="text-[8px]">{REVIEW_STATUS_LABELS[status]}</div>
            </div>
          {/each}
        </div>

        {#if Object.keys(metrics.byCategory).length > 0}
          <div class="p-2 bg-gray-50 rounded border border-gray-200">
            <div class="text-xs font-bold text-gray-700 mb-2">📊 分类闭环进度</div>
            <div class="space-y-1.5">
              {#each Object.entries(metrics.byCategory) as [cat, data]}
                {@const catRate = data.total > 0 ? data.resolved / data.total : 0}
                <div>
                  <div class="flex items-center justify-between text-[10px] mb-0.5">
                    <span class="text-gray-700">{cat}</span>
                    <span class="text-gray-500">{data.resolved}/{data.total}</span>
                  </div>
                  <div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      style="width: {catRate * 100}%; background-color: {getClosureRingStroke(catRate)}"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if collab.users.length > 0}
          <div class="p-2 bg-indigo-50 rounded border border-indigo-200">
            <div class="text-xs font-bold text-indigo-700 mb-2">👥 协作者概况</div>
            <div class="text-[10px] text-indigo-600 mb-1.5">
              共 {collab.users.length} 人参与 · {collab.totalInteractions} 次互动 · {collab.crossUserReplies} 次跨人协作
            </div>
            <div class="space-y-1">
              {#each collab.users as u}
                <div class="flex items-center gap-2 p-1.5 bg-white rounded border border-indigo-100">
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style="background-color: {u.color}">
                    {u.name.substring(0, 1)}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1">
                      <span class="text-[10px] font-medium text-gray-800 truncate">{u.name}</span>
                      <span class="text-[8px] px-1 py-0 rounded bg-indigo-100 text-indigo-600">{REVIEW_USER_ROLE_LABELS[u.role]}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[9px] text-gray-500">
                      <span>📝 {u.commentCount}</span>
                      <span>💬 {u.replyCount}</span>
                      <span>✓ {u.resolvedCount}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if links.length > 0}
          <div class="p-2 bg-emerald-50 rounded border border-emerald-200">
            <div class="text-xs font-bold text-emerald-700 mb-2">🔗 版本-批注追溯链</div>
            <div class="space-y-1.5">
              {#each links.slice(0, 10) as link}
                <button
                  type="button"
                  onclick={() => { activeSubTab = 'review'; setSelectedReviewComment(link.commentId); expandedCommentId = link.commentId; }}
                  class="w-full text-left p-1.5 bg-white rounded border border-emerald-100 hover:bg-emerald-50 transition-colors"
                >
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="text-[9px] font-bold px-1 rounded text-white" style="background-color: {REVIEW_PRIORITY_BADGE[link.commentPriority]}">#{link.commentNumber}</span>
                    <span class="w-2 h-2 rounded-full" style="background-color: {link.commentUserColor}"></span>
                    <span class="text-[10px] text-gray-700 truncate flex-1">{link.commentContent}</span>
                    <span class="text-[9px]">{getTraceabilityStatusIcon(link)}</span>
                  </div>
                  <div class="flex items-center gap-1 text-[9px] text-gray-500">
                    <span class="px-1 py-0 rounded bg-emerald-100 text-emerald-700">v{link.sourceVersionNumber}</span>
                    {#if link.resolvedVersionNumber}
                      <span>→</span>
                      <span class="px-1 py-0 rounded bg-green-100 text-green-700">v{link.resolvedVersionNumber}</span>
                    {:else}
                      <span class="text-gray-400">→ 未解决</span>
                    {/if}
                    <span class="text-[8px] px-1 py-0 rounded border {REVIEW_STATUS_COLORS[link.commentStatus]}">{REVIEW_STATUS_LABELS[link.commentStatus]}</span>
                  </div>
                </button>
              {/each}
              {#if links.length > 10}
                <div class="text-[10px] text-emerald-600 text-center">
                  还有 {links.length - 10} 条追溯记录...
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <div class="p-2 bg-gray-50 rounded border border-gray-200">
          <div class="flex items-center justify-between mb-2">
            <div class="text-xs font-bold text-gray-700">⚡ 活动动态</div>
            {#if dashboardActivityLimit < 50 && activities.length >= dashboardActivityLimit}
              <button
                type="button"
                onclick={() => dashboardActivityLimit += 20}
                class="text-[10px] text-blue-600 hover:underline"
              >
                加载更多
              </button>
            {/if}
          </div>
          {#if activities.length === 0}
            <div class="text-center text-[10px] text-gray-400 py-3">
              暂无评审活动记录
            </div>
          {:else}
            <div class="space-y-1">
              {#each activities as activity}
                <div class="flex items-start gap-2 p-1.5 bg-white rounded border border-gray-100">
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0 mt-0.5" style="background-color: {activity.userColor}">
                    {activity.userName.substring(0, 1)}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="text-[10px] text-gray-700">
                      <span class="font-medium">{activity.userName}</span>
                      <span class="text-gray-500"> {getActivityDescription(activity)}</span>
                    </div>
                    <div class="text-[9px] text-gray-400">{formatDateTime(activity.createdAt)}</div>
                  </div>
                  <span class="text-[10px]">{REVIEW_ACTIVITY_ICONS[activity.type]}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="p-2 bg-slate-50 rounded border border-slate-200">
          <div class="text-xs font-bold text-slate-700 mb-1.5">💡 评审流程指引</div>
          <div class="grid grid-cols-5 gap-1 text-[9px] text-center">
            {#each REVIEW_STATUS_FLOW_ORDER as status, idx}
              <div class="flex flex-col items-center">
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold mb-0.5" style="background-color: {idx === 0 ? '#F59E0B' : idx === 1 ? '#3B82F6' : idx === 2 ? '#10B981' : idx === 3 ? '#14B8A6' : '#64748B'}">
                  {idx + 1}
                </div>
                <div class="text-gray-600">{REVIEW_STATUS_LABELS[status]}</div>
              </div>
            {/each}
          </div>
          <div class="flex items-center mt-1">
            {#each REVIEW_STATUS_FLOW_ORDER as _, idx}
              <div class="flex-1 h-0.5 {idx < REVIEW_STATUS_FLOW_ORDER.length - 1 ? 'bg-gray-300' : ''}"></div>
            {/each}
          </div>
        </div>
      </div>

    {:else if activeSubTab === 'list'}
      {#if sortedVersions.length === 0}
        <div class="p-4 text-center text-gray-500 text-sm">
          暂无版本历史，点击"保存方案"或"新建版本"创建第一个快照
        </div>
      {:else}
        <div class="divide-y divide-gray-100">
          {#each sortedVersions as version}
            {@const isViewing = currentViewingId === version.id}
            {@const isCompA = currentCompareAId === version.id}
            {@const isCompB = currentCompareBId === version.id}
            {@const commentsInVersion = getReviewCommentsForVersion(version.id)}
            <div
              class="p-2 hover:bg-gray-50 cursor-pointer transition-colors {
                isViewing ? 'bg-blue-50 ring-1 ring-blue-300' : ''
              }"
              onclick={() => handleViewVersion(version.id)}
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-1">
                  <span class="text-xs font-bold text-gray-800 bg-gray-200 px-1.5 py-0.5 rounded">
                    v{version.versionNumber}
                  </span>
                  {#if isViewing}
                    <span class="text-xs px-1 py-0.5 bg-blue-500 text-white rounded">
                      查看中
                    </span>
                  {/if}
                  {#if commentsInVersion.length > 0}
                    <span class="text-xs px-1 py-0.5 bg-amber-100 text-amber-700 rounded border border-amber-300" title="该版本包含批注">
                      💬 {commentsInVersion.length}
                    </span>
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={(e) => handleDeleteVersion(e, version.id)}
                  class="text-gray-400 hover:text-red-500 text-xs p-1"
                  title="删除此版本"
                >
                  ✕
                </button>
              </div>

              {#if version.note}
                <div class="text-xs text-gray-700 mb-1 line-clamp-2">
                  {version.note}
                </div>
              {/if}

              <div class="text-xs text-gray-500 mb-1">
                🕐 {formatDateTime(version.createdAt)}
              </div>

              <div class="flex flex-wrap gap-1 mb-2">
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  📍 {version.stats.nodeCount}节点
                </span>
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  〰 {version.stats.ropeCount}缆绳
                </span>
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  📏 {version.stats.totalLength.toFixed(1)}m
                </span>
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  ⚡ {version.stats.totalTension.toFixed(0)}N
                </span>
              </div>

              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); handleSelectCompareA(version.id); }}
                  class="flex-1 text-xs py-1 rounded border transition-colors {
                    isCompA
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-green-50'
                  }"
                  title="选为对比版本A（旧版）"
                >
                  {isCompA ? '✓ 选为A' : '选为A'}
                </button>
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); handleSelectCompareB(version.id); }}
                  class="flex-1 text-xs py-1 rounded border transition-colors {
                    isCompB
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-orange-50'
                  }"
                  title="选为对比版本B（新版）"
                >
                  {isCompB ? '✓ 选为B' : '选为B'}
                </button>
                {#if isViewing}
                  <button
                    type="button"
                    onclick={(e) => { e.stopPropagation(); exitViewVersion(); }}
                    class="flex-1 text-xs py-1 rounded bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                  >
                    退出查看
                  </button>
                {/if}
              </div>

              {#if commentsInVersion.length > 0}
                <div class="mt-2 pt-2 border-t border-gray-100 space-y-1">
                  {#each commentsInVersion.slice(0, 2) as c}
                    <div class="flex items-start gap-1.5 text-xs">
                      <span class="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0" style="background-color: {c.userColor}"></span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1">
                          <span class="text-gray-700 font-medium truncate">{c.userName}</span>
                          <span class="px-1 py-0.5 rounded text-[10px] border {REVIEW_STATUS_COLORS[c.status]}">{REVIEW_STATUS_LABELS[c.status]}</span>
                        </div>
                        <div class="text-gray-600 truncate">{c.content}</div>
                      </div>
                    </div>
                  {/each}
                  {#if commentsInVersion.length > 2}
                    <div class="text-xs text-gray-400 pl-3.5">还有 {commentsInVersion.length - 2} 条意见...</div>
                  {/if}
                </div>
              {/if}

              {#if currentReviewComments.some(rc => rc.resolvedVersionId === version.id)}
                {@const resolvedInVersion = currentReviewComments.filter(rc => rc.resolvedVersionId === version.id)}
                <div class="mt-1 pt-1 border-t border-gray-50">
                  <div class="text-[9px] text-green-600 flex items-center gap-1">
                    ✓ 本版本解决了 {resolvedInVersion.length} 条评审意见
                    {#each resolvedInVersion.slice(0, 3) as rc}
                      <span class="px-1 rounded bg-green-50 border border-green-200 text-green-700">#{rc.commentNumber}</span>
                    {/each}
                    {#if resolvedInVersion.length > 3}
                      <span class="text-green-500">+{resolvedInVersion.length - 3}</span>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeSubTab === 'compare'}
      <div class="p-3 space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <div class="p-2 rounded border-2 border-green-300 bg-green-50">
            <div class="text-xs font-medium text-green-700 mb-1">版本 A（旧版）</div>
            {#if currentCompareAId}
              {@const vA = getVersionById(currentCompareAId)}
              {#if vA}
                {@const aComments = getReviewCommentsForVersion(vA.id)}
                <div class="text-xs text-gray-700">
                  <div class="font-bold">v{vA.versionNumber}</div>
                  <div class="text-gray-500">{formatDateTime(vA.createdAt)}</div>
                  {#if vA.note}
                    <div class="text-gray-600 mt-1 line-clamp-2">{vA.note}</div>
                  {/if}
                  {#if aComments.length > 0}
                    <div class="mt-1 text-amber-600">💬 {aComments.length} 条批注</div>
                  {/if}
                </div>
              {/if}
            {:else}
              <div class="text-xs text-gray-400">请在版本列表中选择版本A</div>
            {/if}
          </div>
          <div class="p-2 rounded border-2 border-orange-300 bg-orange-50">
            <div class="text-xs font-medium text-orange-700 mb-1">版本 B（新版）</div>
            {#if currentCompareBId}
              {@const vB = getVersionById(currentCompareBId)}
              {#if vB}
                {@const bComments = getReviewCommentsForVersion(vB.id)}
                <div class="text-xs text-gray-700">
                  <div class="font-bold">v{vB.versionNumber}</div>
                  <div class="text-gray-500">{formatDateTime(vB.createdAt)}</div>
                  {#if vB.note}
                    <div class="text-gray-600 mt-1 line-clamp-2">{vB.note}</div>
                  {/if}
                  {#if bComments.length > 0}
                    <div class="mt-1 text-amber-600">💬 {bComments.length} 条批注</div>
                  {/if}
                </div>
              {/if}
            {:else}
              <div class="text-xs text-gray-400">请在版本列表中选择版本B</div>
            {/if}
          </div>
        </div>

        {#if currentCompareAId && currentCompareBId}
          <button
            type="button"
            onclick={clearCompare}
            class="w-full px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            清除对比选择
          </button>
        {/if}

        {#if commentsForCurrentDiff.length > 0 || currentDiffFilterCommentId}
          <div class="p-2 bg-amber-50 rounded border border-amber-200">
            <div class="flex items-center justify-between mb-2">
              <div class="text-xs font-bold text-amber-700">
                💬 关联的评审意见（{commentsForCurrentDiff.length}）
                {#if currentDiffFilterCommentId}
                  <span class="ml-1 text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                    🎯 筛选模式
                  </span>
                {/if}
              </div>
              {#if currentDiffFilterCommentId}
                <button
                  type="button"
                  onclick={handleClearDiffFilter}
                  class="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
                >
                  ✕ 清除筛选
                </button>
              {/if}
            </div>
            <div class="flex flex-wrap gap-1">
              {#each commentsForCurrentDiff as c}
                {@const isFilteringThis = currentDiffFilterCommentId === c.id}
                <button
                  type="button"
                  onclick={() => {
                    if (isFilteringThis) {
                      handleClearDiffFilter();
                    } else {
                      setDiffFilterCommentId(c.id);
                    }
                  }}
                  ondblclick={() => {
                    activeSubTab = 'review';
                    setSelectedReviewComment(c.id);
                    expandedCommentId = c.id;
                  }}
                  class="text-xs px-2 py-1 rounded border transition-all flex items-center gap-1 {
                    isFilteringThis
                      ? 'bg-sky-500 text-white border-sky-500 ring-2 ring-sky-300'
                      : REVIEW_STATUS_COLORS[c.status] + ' hover:ring-1 ring-amber-400'
                  }"
                  title="单击筛选差异 · 双击查看详情"
                >
                  <span
                    class="text-[9px] font-bold px-0.5 rounded"
                    style="background-color: {REVIEW_PRIORITY_BADGE[c.priority] || '#9CA3AF'}; color: white"
                  >
                    #{c.commentNumber}
                  </span>
                  <span class="w-2 h-2 rounded-full" style="background-color: {c.userColor}"></span>
                  <span class="max-w-[120px] truncate">{c.content}</span>
                </button>
              {/each}
            </div>
            {#if currentDiffFilterCommentId}
              <div class="mt-2 pt-2 border-t border-amber-200 text-[10px] text-amber-700">
                💡 只显示与此批注相关的差异项。画布中会高亮显示关联元素，其他元素变暗。
              </div>
            {/if}
          </div>
        {/if}

        {#if diff}
          <div class="p-3 bg-gray-50 rounded border border-gray-200">
            <div class="text-xs font-bold text-gray-700 mb-3">📊 差异汇总</div>

            <div class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1.5">📍 节点变更</div>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div class="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded">
                  <span class="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>
                  <span class="text-green-700 font-medium">新增</span>
                  <span class="ml-auto font-bold text-green-800">{diff.summary.addedNodes}</span>
                </div>
                <div class="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded">
                  <span class="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span>
                  <span class="text-red-700 font-medium">删除</span>
                  <span class="ml-auto font-bold text-red-800">{diff.summary.removedNodes}</span>
                </div>
                <div class="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded">
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                  <span class="text-amber-700 font-medium">修改</span>
                  <span class="ml-auto font-bold text-amber-800">{diff.summary.modifiedNodes}</span>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <div class="text-xs font-medium text-gray-600 mb-1.5">〰 缆绳变更</div>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div class="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                  <span class="text-emerald-700 font-medium">新增</span>
                  <span class="ml-auto font-bold text-emerald-800">{diff.summary.addedRopes}</span>
                </div>
                <div class="flex items-center gap-1.5 bg-rose-50 px-2 py-1 rounded">
                  <span class="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"></span>
                  <span class="text-rose-700 font-medium">删除</span>
                  <span class="ml-auto font-bold text-rose-800">{diff.summary.removedRopes}</span>
                </div>
                <div class="flex items-center gap-1.5 bg-orange-50 px-2 py-1 rounded">
                  <span class="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0"></span>
                  <span class="text-orange-700 font-medium">修改</span>
                  <span class="ml-auto font-bold text-orange-800">{diff.summary.modifiedRopes}</span>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-gray-200 space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-600">📏 总长度变化</span>
                <span class={`font-bold ${diff.summary.totalLengthDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {diff.summary.totalLengthDelta >= 0 ? '+' : ''}{diff.summary.totalLengthDelta.toFixed(2)}m
                </span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-600">⚡ 总张力变化</span>
                <span class={`font-bold ${diff.summary.totalTensionDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {diff.summary.totalTensionDelta >= 0 ? '+' : ''}{diff.summary.totalTensionDelta.toFixed(0)}N
                </span>
              </div>
            </div>
          </div>

          {#if (filteredDiffForSelectedComment?.nodeDiffs ?? diff.nodeDiffs).length > 0 || !currentDiffFilterCommentId}
          <div class="space-y-1">
            <div class="text-xs font-bold text-gray-700 flex items-center gap-1">
              <span>📍 节点变更 ({(filteredDiffForSelectedComment?.nodeDiffs ?? diff.nodeDiffs).length})</span>
                {#if currentDiffFilterCommentId}
                  <span class="text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                    已筛选
                  </span>
                {/if}
              </div>
              {#each (filteredDiffForSelectedComment?.nodeDiffs ?? diff.nodeDiffs) as nd}
                {@const relatedComments = getCommentsForDiffItem('node', nd.nodeId)}
                <div class="p-2 rounded bg-white border border-gray-200 {getChangeTypeBorder(nd.changeType)}">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-gray-800">{nd.label}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded {getChangeTypeColor(nd.changeType)}">
                      {getChangeTypeLabel(nd.changeType)}
                    </span>
                  </div>
                  {#if nd.newNode}
                    <div class="text-xs text-gray-500">
                      类型: {getNodeTypeLabel(nd.newNode)}
                      {#if nd.newNode.type === 'pulley'}
                        · {PULLEY_DIRECTION_LABELS[(nd.newNode as any).direction]}
                        · {(nd.newNode as any).active ? '启用' : '停用'}
                      {/if}
                    </div>
                  {/if}
                  {#if nd.changeType === 'modified'}
                    <div class="text-xs text-amber-600 mt-1">
                      {renderNodeDiff(nd)}
                    </div>
                  {/if}
                  {#if relatedComments.length > 0}
                    <div class="mt-2 pt-2 border-t border-gray-100">
                      <div class="text-[10px] font-medium text-amber-700 mb-1">💬 关联评审意见</div>
                      <div class="flex flex-wrap gap-1">
                        {#each relatedComments as rc}
                          <button
                            type="button"
                            onclick={() => { activeSubTab = 'review'; setSelectedReviewComment(rc.id); expandedCommentId = rc.id; }}
                            class="text-[10px] px-1.5 py-0.5 rounded border {REVIEW_STATUS_COLORS[rc.status]} hover:ring-1 ring-amber-400 flex items-center gap-1"
                          >
                            <span class="w-1.5 h-1.5 rounded-full" style="background-color: {rc.userColor}"></span>
                            <span class="max-w-[80px] truncate">{rc.content}</span>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            {:else if currentDiffFilterCommentId}
            <div class="p-3 text-center text-xs text-sky-600 bg-sky-50 rounded border border-sky-200">
              🎯 当前筛选条件下无节点变更
            </div>
            {/if}

            {#if (filteredDiffForSelectedComment?.ropeDiffs ?? diff.ropeDiffs).length > 0 || !currentDiffFilterCommentId}
            <div class="space-y-1">
              <div class="text-xs font-bold text-gray-700 flex items-center gap-1">
                <span>〰 缆绳变更 ({(filteredDiffForSelectedComment?.ropeDiffs ?? diff.ropeDiffs).length})</span>
                {#if currentDiffFilterCommentId}
                  <span class="text-[10px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                    已筛选
                  </span>
                {/if}
              </div>
              {#each (filteredDiffForSelectedComment?.ropeDiffs ?? diff.ropeDiffs) as rd}
                {@const relatedComments = getCommentsForDiffItem('rope', rd.ropeId)}
                <div class="p-2 rounded bg-white border border-gray-200 {getChangeTypeBorder(rd.changeType)}">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-gray-800">{rd.label}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded {getChangeTypeColor(rd.changeType)}">
                      {getChangeTypeLabel(rd.changeType)}
                    </span>
                  </div>
                  {#if rd.changeType === 'modified'}
                    <div class="text-xs text-amber-600 mt-1">
                      {renderRopeDiff(rd)}
                    </div>
                    {#if rd.pathChanges && rd.pathChanges.length > 0}
                      <div class="mt-1 space-y-0.5">
                        {#each rd.pathChanges as pc}
                          {@const pathNode = rd.newRope?.nodePath[pc.index ?? 0]}
                          {@const nodeId = pathNode?.nodeId || pc.nodeId}
                          <div class="text-xs flex items-center gap-1">
                            <span class="px-1 py-0.5 rounded {pc.type === 'added' ? 'bg-green-100 text-green-700' : pc.type === 'removed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">
                              {pc.type === 'added' ? '+节点' : pc.type === 'removed' ? '-节点' : '⇄换序'}
                            </span>
                            <span class="text-gray-600">
                              位置 {pc.index !== undefined ? pc.index + 1 : '?'}
                            </span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {:else if rd.changeType === 'added'}
                    <div class="text-xs text-green-600 mt-1">
                      新增缆绳，包含以下参数：
                    </div>
                  {:else if rd.changeType === 'removed'}
                    <div class="text-xs text-red-600 mt-1">
                      缆绳被删除，原参数：
                    </div>
                  {/if}
                  {#if rd.newRope || rd.oldRope}
                    {@const ropeToShow = rd.newRope || rd.oldRope}
                    {#if ropeToShow}
                      <div class="text-xs text-gray-500 mt-1">
                        📏 {ropeToShow.totalLength.toFixed(1)}m · ⚡ {ropeToShow.tension}N · {ropeToShow.nodePath.length - 1}段
                      </div>
                      {#if ropeToShow.description}
                        <div class="text-xs text-gray-500 mt-0.5">
                          📝 {ropeToShow.description}
                        </div>
                      {/if}
                    {/if}
                  {/if}
                  {#if relatedComments.length > 0}
                    <div class="mt-2 pt-2 border-t border-gray-100">
                      <div class="text-[10px] font-medium text-amber-700 mb-1">💬 关联评审意见</div>
                      <div class="flex flex-wrap gap-1">
                        {#each relatedComments as rc}
                          <button
                            type="button"
                            onclick={() => { activeSubTab = 'review'; setSelectedReviewComment(rc.id); expandedCommentId = rc.id; }}
                            class="text-[10px] px-1.5 py-0.5 rounded border {REVIEW_STATUS_COLORS[rc.status]} hover:ring-1 ring-amber-400 flex items-center gap-1"
                          >
                            <span class="w-1.5 h-1.5 rounded-full" style="background-color: {rc.userColor}"></span>
                            <span class="max-w-[80px] truncate">{rc.content}</span>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if diff.nodeDiffs.length === 0 && diff.ropeDiffs.length === 0}
            <div class="p-4 text-center text-gray-500 text-sm bg-green-50 rounded border border-green-200">
              ✓ 两个版本完全相同，无差异
            </div>
          {/if}
        {:else}
          <div class="p-4 text-center text-gray-500 text-sm">
            请先在"版本列表"标签页选择两个版本进行对比<br />
            <span class="text-xs text-gray-400 mt-1">
              提示：点击版本卡片中的"选为A"和"选为B"按钮
            </span>
          </div>
        {/if}
      </div>

    {:else if activeSubTab === 'playback'}
      <div class="p-3 space-y-3">
        {#if !currentIsPlayback}
          <div class="p-4 text-center text-gray-500 text-sm bg-gray-50 rounded border border-gray-200">
            <div class="text-2xl mb-2">🎬</div>
            <div>点击上方"开始回放"按钮启动时间轴</div>
            <div class="text-xs text-gray-400 mt-1">
              {#if currentSelectedRopeId}
                已选中缆绳，将追踪其变化过程
              {:else}
                可选定某根缆绳以追踪其单独调整过程
              {/if}
            </div>
            <div class="text-xs text-gray-400 mt-2">
              需要至少 2 个版本（当前 {sortedVersions.length} 个）
            </div>
          </div>
        {:else}
          <div class="p-2 bg-purple-50 rounded border border-purple-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-purple-700">
                🎬 回放进度 {currentPlaybackIndex + 1} / {currentPlaybackSteps.length}
              </span>
              <button
                type="button"
                onclick={handleStopPlayback}
                class="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
              >
                ■ 停止
              </button>
            </div>

            <div class="flex items-center gap-1 mb-2">
              <button
                type="button"
                onclick={prevPlaybackStep}
                class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                disabled={currentPlaybackIndex <= 0}
              >
                ◀ 上一步
              </button>
              <button
                type="button"
                onclick={toggleAutoPlay}
                class="flex-1 px-2 py-1 text-xs rounded {
                  playbackAutoPlay
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }"
              >
                {playbackAutoPlay ? '⏸ 暂停' : '▶ 自动播放'}
              </button>
              <button
                type="button"
                onclick={nextPlaybackStep}
                class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                disabled={currentPlaybackIndex >= currentPlaybackSteps.length - 1}
              >
                下一步 ▶
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs text-gray-600">
              <span>速度:</span>
              <input
                type="range"
                min="500"
                max="5000"
                step="500"
                bind:value={playbackSpeed}
                class="flex-1"
              />
              <span>{(playbackSpeed / 1000).toFixed(1)}s</span>
            </div>

            <div class="mt-2 pt-2 border-t border-purple-200">
              <label class="flex items-center gap-1.5 text-xs text-purple-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentShowPlaybackComments}
                  onchange={toggleShowPlaybackComments}
                  class="w-3 h-3"
                />
                显示当前步骤的批注与处理记录
              </label>
            </div>
          </div>

          {#if currentPlaybackIndex >= 0 && currentPlaybackSteps[currentPlaybackIndex]}
            {@const step = currentPlaybackSteps[currentPlaybackIndex]}
            <div class="p-2 bg-white rounded border border-gray-200">
              <div class="flex items-center gap-2 mb-2">
                <span class="w-6 h-6 rounded-full bg-purple-500 text-white text-xs font-bold flex items-center justify-center">
                  {step.stepNumber}
                </span>
                <span class="text-xs font-bold text-gray-700">
                  v{step.snapshot.versionNumber} · {formatDateTime(step.snapshot.createdAt)}
                </span>
              </div>
              <div class="text-xs text-gray-800 mb-2">{step.description}</div>
              {#if step.changes && step.changes.length > 0}
                <div class="space-y-0.5">
                  {#each step.changes as change}
                    <div class="text-xs text-gray-600 flex items-center gap-1">
                      <span class="w-1 h-1 rounded-full bg-purple-400"></span>
                      {change}
                    </div>
                  {/each}
                </div>
              {/if}
              <div class="mt-2 flex flex-wrap gap-1">
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  📍 {step.snapshot.stats.nodeCount}节点
                </span>
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  〰 {step.snapshot.stats.ropeCount}缆绳
                </span>
                <span class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                  📏 {step.snapshot.stats.totalLength.toFixed(1)}m
                </span>
              </div>
            </div>

            {#if currentShowPlaybackComments && commentsForCurrentPlayback.length > 0}
              <div class="p-2 bg-indigo-50 rounded border border-indigo-200 space-y-2">
                <div class="text-xs font-bold text-indigo-700">
                  💬 本步骤批注与处理记录（{commentsForCurrentPlayback.length}）
                </div>
                {#each commentsForCurrentPlayback as c}
                  {@const createdInStep = isCommentCreatedInStep(c, currentPlaybackIndex)}
                  {@const resolvedInStep = isCommentResolvedInStep(c, currentPlaybackIndex)}
                  {@const commentActivities = getActivitiesForComment(c.id)}
                  {@const stepActivities = commentActivities.filter(a => {
                    const step = currentPlaybackSteps[currentPlaybackIndex];
                    if (!step) return false;
                    const stepTime = new Date(step.snapshot.createdAt).getTime();
                    const actTime = new Date(a.createdAt).getTime();
                    const nextStepTime = currentPlaybackIndex < currentPlaybackSteps.length - 1
                      ? new Date(currentPlaybackSteps[currentPlaybackIndex + 1].snapshot.createdAt).getTime()
                      : Date.now();
                    return actTime >= stepTime && actTime < nextStepTime;
                  })}
                  <div
                    class="p-2 rounded border-l-4 bg-white {
                      createdInStep ? 'border-amber-400' : resolvedInStep ? 'border-green-400' : 'border-gray-200'
                    }"
                  >
                    <div class="flex items-center gap-1.5 mb-1">
                      <span class="w-2.5 h-2.5 rounded-full" style="background-color: {c.userColor}"></span>
                      <span class="text-xs font-medium text-gray-800 truncate">{c.userName}</span>
                      <span class="text-[10px] px-1 py-0.5 rounded border {REVIEW_STATUS_COLORS[c.status]}">{REVIEW_STATUS_LABELS[c.status]}</span>
                      {#if createdInStep}
                        <span class="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">📝 本步提出</span>
                      {/if}
                      {#if resolvedInStep}
                        <span class="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">✓ 本步解决</span>
                      {/if}
                    </div>
                    <div class="text-xs text-gray-700 mb-1">{c.content}</div>
                    {#if c.selection.targetType !== 'general'}
                      <div class="text-[10px] text-indigo-600 mb-1">
                        🎯 {formatReviewSelection(c.selection, c.versionId || undefined)}
                      </div>
                    {/if}
                    {#if resolvedInStep && c.resolvedByName}
                      <div class="text-[10px] text-green-600 mb-1">
                        解决人：{c.resolvedByName}
                        {#if c.resolveNote}「{c.resolveNote}」{/if}
                      </div>
                    {/if}
                    {#if stepActivities.length > 0}
                      <div class="mt-1 pt-1 border-t border-gray-100 space-y-0.5">
                        {#each stepActivities.slice(0, 5) as act}
                          <div class="text-[9px] text-gray-500 flex items-center gap-1">
                            <span>{REVIEW_ACTIVITY_ICONS[act.type]}</span>
                            <span class="w-2 h-2 rounded-full" style="background-color: {act.userColor}"></span>
                            <span>{act.userName}</span>
                            <span class="text-gray-400">{getActivityDescription(act)}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <div class="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                      <span>{formatDateTime(c.createdAt)}</span>
                      <button
                        type="button"
                        onclick={() => { activeSubTab = 'review'; setSelectedReviewComment(c.id); expandedCommentId = c.id; }}
                        class="text-indigo-600 hover:underline"
                      >
                        查看详情 →
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          <div class="space-y-1">
            <div class="text-xs font-bold text-gray-700">时间轴</div>
            <div class="space-y-1">
              {#each currentPlaybackSteps as step, idx}
                {@const stepComments = (() => {
                  const vid = step.snapshot.id;
                  return currentReviewComments.filter(c => c.versionId === vid || c.resolvedVersionId === vid);
                })()}
                <button
                  type="button"
                  onclick={() => goToPlaybackStep(idx)}
                  class="w-full text-left p-1.5 rounded text-xs transition-colors flex items-center gap-2 {
                    idx === currentPlaybackIndex
                      ? 'bg-purple-500 text-white'
                      : idx < currentPlaybackIndex
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }"
                >
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold {
                    idx === currentPlaybackIndex ? 'bg-white text-purple-500' : idx < currentPlaybackIndex ? 'bg-purple-500 text-white' : 'bg-gray-300 text-gray-600'
                  }">
                    {idx < currentPlaybackIndex ? '✓' : idx + 1}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="truncate">v{step.snapshot.versionNumber} · {step.description}</div>
                    {#if stepComments.length > 0 && currentShowPlaybackComments}
                      <div class="flex items-center gap-0.5 mt-0.5">
                        {#each stepComments.slice(0, 5) as sc}
                          <span class="w-2 h-2 rounded-full" style="background-color: {sc.userColor}; opacity: 0.9" title={sc.userName}></span>
                        {/each}
                        {#if stepComments.length > 5}
                          <span class="text-[9px] opacity-80">+{stepComments.length - 5}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

    {:else if activeSubTab === 'review'}
      <div class="p-3 space-y-3">
        <div class="grid grid-cols-7 gap-1">
          <div
            class="p-1.5 rounded border cursor-pointer transition-colors text-center {
              currentReviewFilterStatus === 'all'
                ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }"
            onclick={() => filterCommentsByStatus('all')}
          >
            <div class="text-sm font-bold text-gray-800">{reviewCommentStats.total}</div>
            <div class="text-[8px] text-gray-600">全部</div>
          </div>
          {#each (['pending', 'in_progress', 'resolved', 'verified', 'closed', 'rejected'] as ReviewStatus[]) as s}
            <div
              class="p-1.5 rounded border cursor-pointer transition-colors text-center {
                currentReviewFilterStatus === s
                  ? 'ring-1 ' + REVIEW_STATUS_COLORS[s]
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }"
              onclick={() => filterCommentsByStatus(s)}
            >
              <div class="text-sm font-bold">
                {#if s === 'pending'}{reviewCommentStatsDetailed.pending}
                {:else if s === 'in_progress'}{reviewCommentStatsDetailed.in_progress}
                {:else if s === 'resolved'}{reviewCommentStatsDetailed.resolved}
                {:else if s === 'verified'}{reviewCommentStatsDetailed.verified}
                {:else if s === 'closed'}{reviewCommentStatsDetailed.closed}
                {:else}{reviewCommentStatsDetailed.rejected}{/if}
              </div>
              <div class="text-[7px]">{REVIEW_STATUS_LABELS[s]}</div>
            </div>
          {/each}
        </div>

        {#if (['critical', 'high', 'medium', 'low'] as ReviewPriority[]).some(p => currentReviewComments.some(c => c.priority === p))}
          <div class="p-2 bg-gray-50 rounded border border-gray-200">
            <div class="text-xs font-medium text-gray-700 mb-1.5">按优先级筛选：</div>
            <div class="flex flex-wrap gap-1">
              <button
                type="button"
                onclick={() => filterCommentsByPriority('all')}
                class="text-[10px] px-2 py-0.5 rounded border transition-colors {
                  currentReviewFilterPriority === 'all'
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }"
              >
                全部
              </button>
              {#each (['critical', 'high', 'medium', 'low'] as ReviewPriority[]) as p}
                {#if currentReviewComments.some(c => c.priority === p)}
                  <button
                    type="button"
                    onclick={() => filterCommentsByPriority(p)}
                    class="text-[10px] px-2 py-0.5 rounded border transition-colors {
                      currentReviewFilterPriority === p
                        ? REVIEW_PRIORITY_COLORS[p] + ' ring-1'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }"
                  >
                    {REVIEW_PRIORITY_LABELS[p]} ({currentReviewComments.filter(c => c.priority === p).length})
                  </button>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        {#if uniqueReviewers.length > 0}
          <div class="p-2 bg-gray-50 rounded border border-gray-200">
            <div class="text-xs font-medium text-gray-700 mb-1.5">按评审员筛选：</div>
            <div class="flex flex-wrap gap-1">
              <button
                type="button"
                onclick={() => filterCommentsByUser(null)}
                class="text-xs px-2 py-0.5 rounded border transition-colors {
                  !currentReviewFilterUserId
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }"
              >
                全部
              </button>
              {#each uniqueReviewers as u}
                <button
                  type="button"
                  onclick={() => filterCommentsByUser(u.id)}
                  class="text-xs px-2 py-0.5 rounded border transition-colors flex items-center gap-1 {
                    currentReviewFilterUserId === u.id
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }"
                >
                  <span class="w-2 h-2 rounded-full" style="background-color: {u.color}"></span>
                  {u.name}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if currentIsReviewSelectionActive}
          <div class="p-2 bg-amber-50 rounded border border-amber-200">
            <div class="flex items-center justify-between mb-2">
              <div class="text-xs font-bold text-amber-700">🎯 圈选批注模式</div>
              <button
                type="button"
                onclick={cancelReviewSelection}
                class="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
              >
                ✕ 取消
              </button>
            </div>
            <div class="text-xs text-amber-700 mb-2">
              {#if currentReviewSelection.targetType === 'general'}
                全局批注：不关联特定元素
              {:else}
                在画布上点击节点/缆绳进行圈选，或直接输入意见：
              {/if}
            </div>
            {#if currentReviewSelection.nodeIds && currentReviewSelection.nodeIds.length > 0}
              <div class="text-[10px] text-amber-800 mb-1">
                已选节点：
                {#each currentReviewSelection.nodeIds as nid}
                  <span class="inline-block px-1 py-0.5 bg-white rounded border border-amber-300 mr-1 mb-0.5">
                    {getNodeLabelById(nid, currentVersionForComment || undefined)}
                    <button
                      type="button"
                      onclick={() => store.removeNodeFromReviewSelection(nid)}
                      class="ml-0.5 text-amber-500 hover:text-red-500"
                    >✕</button>
                  </span>
                {/each}
              </div>
            {/if}
            {#if currentReviewSelection.ropeIds && currentReviewSelection.ropeIds.length > 0}
              <div class="text-[10px] text-amber-800 mb-1">
                已选缆绳：
                {#each currentReviewSelection.ropeIds as rid}
                  <span class="inline-block px-1 py-0.5 bg-white rounded border border-amber-300 mr-1 mb-0.5">
                    {getRopeLabelById(rid, currentVersionForComment || undefined)}
                    <button
                      type="button"
                      onclick={() => store.removeRopeFromReviewSelection(rid)}
                      class="ml-0.5 text-amber-500 hover:text-red-500"
                    >✕</button>
                  </span>
                {/each}
              </div>
            {/if}
            <div class="space-y-2 mt-2">
              {#if allReviewUsers.length > 0}
                <div class="flex flex-wrap gap-1">
                  {#each allReviewUsers as u}
                    <button
                      type="button"
                      onclick={() => { newCommentContent += `@${u.name} `; }}
                      class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 flex items-center gap-0.5"
                      title="点击提及 {u.name}"
                    >
                      <span class="w-2 h-2 rounded-full" style="background-color: {u.color}"></span>
                      @{u.name}
                    </button>
                  {/each}
                </div>
              {/if}
              <textarea
                bind:value={newCommentContent}
                rows="3"
                placeholder="请输入您的评审意见... 使用 @用户名 提及他人"
                class="w-full px-2 py-1.5 text-xs border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              ></textarea>
              <button
                type="button"
                onclick={handleCreateReviewComment}
                class="w-full px-3 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
              >
                ✓ 提交批注
              </button>
            </div>
          </div>
        {:else if currentViewingId || currentIsPlayback}
          <div class="p-2 bg-indigo-50 rounded border border-indigo-200">
            <div class="text-xs font-bold text-indigo-700 mb-1.5">📝 对当前版本发表意见</div>
            <div class="text-[10px] text-indigo-600 mb-2">
              {#if currentViewingId}
                正在查看版本 v{getVersionById(currentViewingId)?.versionNumber}
              {:else if currentIsPlayback && currentPlaybackIndex >= 0}
                正在回放第 {currentPlaybackIndex + 1} 步（v{currentPlaybackSteps[currentPlaybackIndex]?.snapshot.versionNumber}）
              {/if}
            </div>
            <div class="flex flex-wrap gap-1 mb-2">
              <button
                type="button"
                onclick={() => { ensureDefaultReviewUser(); startReviewSelection('node'); }}
                class="text-[10px] px-2 py-1 rounded bg-white text-gray-700 border border-indigo-300 hover:bg-indigo-100"
              >
                📍 圈选节点
              </button>
              <button
                type="button"
                onclick={() => { ensureDefaultReviewUser(); startReviewSelection('rope'); }}
                class="text-[10px] px-2 py-1 rounded bg-white text-gray-700 border border-indigo-300 hover:bg-indigo-100"
              >
                〰 圈选缆绳
              </button>
              <button
                type="button"
                onclick={() => { ensureDefaultReviewUser(); startReviewSelection('general'); }}
                class="text-[10px] px-2 py-1 rounded bg-white text-gray-700 border border-indigo-300 hover:bg-indigo-100"
              >
                💭 全局意见
              </button>
            </div>
          </div>
        {:else}
          <div class="p-2 bg-gray-50 rounded border border-gray-200">
            <div class="text-xs font-bold text-gray-700 mb-1">💡 如何使用协作评审中心</div>
            <div class="text-[10px] text-gray-600 space-y-0.5">
              <div>1. 📊 在「评审中心」查看闭环进度、活动动态和追溯链</div>
              <div>2. 📋 在「版本列表」中点击版本查看，对方案添加批注</div>
              <div>3. 🎯 圈选特定节点/缆绳发表定向意见，使用 @用户名 提及</div>
              <div>4. 🔄 完整生命周期：待处理 → 处理中 → 已解决 → 已验证 → 已关闭</div>
              <div>5. 📌 指定版本解决，形成版本-批注追溯链</div>
              <div>6. 🔗 在「差异对比」中按意见筛选差异，查看修改追溯</div>
              <div>7. ▶ 在「时间回放」中叠加显示批注与处理记录</div>
            </div>
          </div>
        {/if}

        {#if filteredComments.length === 0}
          <div class="p-4 text-center text-gray-500 text-sm bg-gray-50 rounded border border-gray-200">
            {#if currentReviewComments.length === 0}
              <div class="text-2xl mb-2">💬</div>
              <div>暂无评审批注</div>
              <div class="text-xs text-gray-400 mt-1">进入版本查看后可对方案添加批注</div>
            {:else}
              <div>当前筛选条件下没有批注</div>
              <button
                type="button"
                onclick={() => { filterCommentsByStatus('all'); filterCommentsByUser(null); }}
                class="mt-2 text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                重置筛选
              </button>
            {/if}
          </div>
        {:else}
          <div class="space-y-2">
            {#each filteredComments as comment}
              {@const isExpanded = expandedCommentId === comment.id}
              {@const isSelected = currentSelectedReviewCommentId === comment.id}
              {@const commentVersion = comment.versionId ? getVersionById(comment.versionId) : undefined}
              {@const resolvedVersion = comment.resolvedVersionId ? getVersionById(comment.resolvedVersionId) : undefined}
              <div
                class="rounded border overflow-hidden cursor-pointer transition-colors {
                  isSelected ? 'ring-2 ring-blue-400 border-blue-300' : 'border-gray-200 bg-white hover:bg-gray-50'
                }"
                onclick={() => handleSelectComment(comment)}
              >
                <div
                  class="px-2 py-2 flex items-start gap-2 {
                    comment.status === 'resolved' ? 'bg-green-50'
                    : comment.status === 'in_progress' ? 'bg-blue-50'
                    : comment.status === 'rejected' ? 'bg-gray-50'
                    : 'bg-amber-50'
                  }"
                  ondblclick={() => toggleCommentExpand(comment.id)}
                >
                  <span
                    class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5"
                    style="background-color: {comment.userColor}"
                    title={`${comment.userName}（${REVIEW_USER_ROLE_LABELS[comment.userRole]}）`}
                  >
                    {comment.userName.substring(0, 1)}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 mb-1 flex-wrap">
                      <span class="text-xs font-medium text-gray-800 truncate">{comment.userName}</span>
                      <span class="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600">
                        {REVIEW_USER_ROLE_LABELS[comment.userRole]}
                      </span>
                      <span class="text-[10px] px-1 py-0.5 rounded border {REVIEW_STATUS_COLORS[comment.status]}">
                        {REVIEW_STATUS_LABELS[comment.status]}
                      </span>
                      <button
                        type="button"
                        onclick={(e) => { e.stopPropagation(); toggleCommentExpand(comment.id); }}
                        class="ml-auto text-gray-400 hover:text-gray-600 text-[10px]"
                      >
                        {isExpanded ? '收起 ▲' : '展开 ▼'}
                      </button>
                    </div>
                    <div class="text-xs text-gray-700 mb-1.5 leading-relaxed">
                      {comment.content}
                    </div>
                    <div class="flex items-center gap-1 flex-wrap text-[10px] text-gray-500 mb-1">
                      {#if commentVersion}
                        <button
                          type="button"
                          class="px-1 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                          onclick={(e) => { e.stopPropagation(); handleJumpToVersion(commentVersion.id); }}
                        >
                          v{commentVersion.versionNumber}
                        </button>
                      {/if}
                      {#if comment.selection.targetType !== 'general'}
                        <span class="px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                          {formatReviewSelection(comment.selection, comment.versionId || undefined)}
                        </span>
                      {:else}
                        <span class="px-1 py-0.5 rounded bg-gray-100 text-gray-500">全局</span>
                      {/if}
                      <span class="text-gray-400">{formatDateTime(comment.createdAt)}</span>
                    </div>
                    {#if resolvedVersion}
                      <div class="text-[10px] text-green-700 flex items-center gap-1">
                        ✓ 于 v{resolvedVersion.versionNumber} 中解决
                        {#if comment.resolvedAt}
                          <span class="text-gray-400">({formatDateTime(comment.resolvedAt)})</span>
                        {/if}
                      </div>
                    {/if}
                    {#if comment.replies && comment.replies.length > 0}
                      <div class="text-[10px] text-gray-500 mt-0.5">
                        💬 {comment.replies.length} 条回复
                      </div>
                    {/if}
                  </div>
                </div>

                {#if isExpanded}
                  {@const lifecycleSteps = getLifecycleSteps(comment)}
                  <div class="px-2 py-2 border-t border-gray-100 bg-gray-50 space-y-2" onclick={(e) => e.stopPropagation()}>
                    <div class="p-2 bg-white rounded border border-gray-200">
                      <div class="text-[10px] font-bold text-gray-600 mb-1.5">🔄 处理生命周期</div>
                      <div class="flex items-center">
                        {#each lifecycleSteps as step, idx}
                          <div class="flex flex-col items-center flex-1">
                            <div class="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold {
                              step.active && step.status !== 'rejected'
                                ? 'bg-blue-500 text-white'
                                : step.active && step.status === 'rejected'
                                  ? 'bg-gray-500 text-white'
                                  : 'bg-gray-200 text-gray-400'
                            }">
                              {step.active ? '✓' : idx + 1}
                            </div>
                            <div class="text-[7px] mt-0.5 {step.active ? 'text-gray-700 font-medium' : 'text-gray-400'}">{step.label}</div>
                          </div>
                          {#if idx < lifecycleSteps.length - 1}
                            <div class="flex-1 h-0.5 {lifecycleSteps[idx + 1].active ? 'bg-blue-400' : 'bg-gray-200'} -mt-3"></div>
                          {/if}
                        {/each}
                      </div>
                      {#if comment.replies && comment.replies.length > 0}
                        <div class="mt-2 pt-1.5 border-t border-gray-100 space-y-0.5">
                          {#each comment.replies.filter(r => r.changedStatusTo) as statusReply}
                            <div class="text-[9px] text-gray-500 flex items-center gap-1">
                              <span class="w-2 h-2 rounded-full" style="background-color: {statusReply.userColor}"></span>
                              <span>{statusReply.userName}</span>
                              <span>→</span>
                              <span class="px-1 rounded border {REVIEW_STATUS_COLORS[statusReply.changedStatusTo!]}">{REVIEW_STATUS_LABELS[statusReply.changedStatusTo!]}</span>
                              <span class="ml-auto text-gray-400">{formatDateTime(statusReply.createdAt)}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <div class="flex flex-wrap gap-1">
                      {#if comment.status !== 'in_progress'}
                        <button
                          type="button"
                          onclick={() => handleChangeStatus(comment.id, 'in_progress')}
                          class="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200"
                        >
                          标记处理中
                        </button>
                      {/if}
                      {#if comment.status !== 'resolved'}
                        <button
                          type="button"
                          onclick={() => handleChangeStatus(comment.id, 'resolved')}
                          class="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
                        >
                          ✓ 标记解决
                        </button>
                        {#if sortedVersions.length > 0}
                          <button
                            type="button"
                            onclick={() => openResolveWithVersion(comment.id)}
                            class="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200"
                          >
                            📌 指定版本解决
                          </button>
                        {/if}
                      {/if}
                      {#if comment.status === 'resolved'}
                        <button
                          type="button"
                          onclick={() => handleVerifyComment(comment.id)}
                          class="text-[10px] px-2 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-300 hover:bg-teal-200"
                        >
                          ✅ 验证确认
                        </button>
                      {/if}
                      {#if comment.status === 'verified'}
                        <button
                          type="button"
                          onclick={() => handleCloseComment(comment.id)}
                          class="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-300"
                        >
                          📁 归档关闭
                        </button>
                      {/if}
                      {#if comment.status !== 'rejected'}
                        <button
                          type="button"
                          onclick={() => handleChangeStatus(comment.id, 'rejected')}
                          class="text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-700 border border-gray-300 hover:bg-gray-300"
                        >
                          ✕ 标记拒绝
                        </button>
                      {/if}
                      {#if comment.status !== 'pending' && comment.status !== 'in_progress'}
                        <button
                          type="button"
                          onclick={() => handleReopenComment(comment.id)}
                          class="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200"
                        >
                          🔓 重新打开
                        </button>
                      {/if}
                      <button
                        type="button"
                        onclick={() => handleJumpFromCommentToDiff(comment)}
                        class="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200"
                        title="跳转到差异对比，查看解决此问题的修改"
                      >
                        🔗 查看追溯
                      </button>
                      <button
                        type="button"
                        onclick={() => handleDeleteComment(comment.id)}
                        class="ml-auto text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                      >
                        删除批注
                      </button>
                    </div>

                    {#if comment.replies && comment.replies.length > 0}
                      <div class="space-y-1.5 pt-1 border-t border-gray-200">
                        {#each comment.replies as reply, replyIdx}
                          <div
                            class="flex gap-1.5 text-xs {replyIdx < comment.replies.length - 1 ? 'pb-1.5 border-b border-gray-100' : ''}"
                          >
                            <span
                              class="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[8px] font-bold mt-0.5"
                              style="background-color: {reply.userColor}"
                            >
                              {reply.userName.substring(0, 1)}
                            </span>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-1 mb-0.5">
                                <span class="font-medium text-gray-700 truncate">{reply.userName}</span>
                                {#if reply.changedStatusTo}
                                  <span class="text-[9px] px-1 py-0.5 rounded border {REVIEW_STATUS_COLORS[reply.changedStatusTo]}">
                                    → {REVIEW_STATUS_LABELS[reply.changedStatusTo]}
                                  </span>
                                {/if}
                                <span class="text-[9px] text-gray-400 ml-auto">
                                  {formatDateTime(reply.createdAt)}
                                </span>
                              </div>
                              <div class="text-gray-600">{reply.content}</div>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <div class="flex gap-1 pt-1 border-t border-gray-200">
                      <div class="flex-1 relative">
                        <input
                          type="text"
                          bind:value={replyInputMap[comment.id]}
                          placeholder="添加回复... 使用 @用户名 提及他人"
                          class="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          onkeydown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSendReply(comment.id);
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onclick={() => handleSendReply(comment.id)}
                        class="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                        disabled={!(replyInputMap[comment.id] || '').trim()}
                      >
                        回复
                      </button>
                    </div>

                    {#if comment.versionId || comment.resolvedVersionId}
                      <div class="p-2 bg-emerald-50 rounded border border-emerald-200">
                        <div class="text-[10px] font-bold text-emerald-700 mb-1">🔗 追溯信息</div>
                        <div class="space-y-0.5 text-[9px]">
                          {#if comment.versionId}
                            {@const srcV = getVersionById(comment.versionId)}
                            <div class="flex items-center gap-1 text-gray-600">
                              <span>提出版本：</span>
                              {#if srcV}
                                <button
                                  type="button"
                                  onclick={() => handleJumpToVersion(srcV.id)}
                                  class="px-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                >
                                  v{srcV.versionNumber}
                                </button>
                              {:else}
                                <span class="text-gray-400">已删除</span>
                              {/if}
                              <span class="text-gray-400">{formatDateTime(comment.createdAt)}</span>
                            </div>
                          {/if}
                          {#if comment.resolvedVersionId}
                            {@const resV = getVersionById(comment.resolvedVersionId)}
                            <div class="flex items-center gap-1 text-green-600">
                              <span>解决版本：</span>
                              {#if resV}
                                <button
                                  type="button"
                                  onclick={() => handleJumpToVersion(resV.id)}
                                  class="px-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                                >
                                  v{resV.versionNumber}
                                </button>
                              {:else}
                                <span class="text-gray-400">已删除</span>
                              {/if}
                              {#if comment.resolvedAt}
                                <span class="text-gray-400">{formatDateTime(comment.resolvedAt)}</span>
                              {/if}
                            </div>
                          {/if}
                          {#if comment.resolvedByName}
                            <div class="text-gray-500">
                              解决人：{comment.resolvedByName}
                              {#if comment.resolveNote}
                                <span class="ml-1">「{comment.resolveNote}」</span>
                              {/if}
                            </div>
                          {/if}
                          {#if comment.verifiedByName}
                            <div class="text-teal-600">
                              验证人：{comment.verifiedByName}
                              {#if comment.verifiedAt}
                                <span class="text-gray-400 ml-1">{formatDateTime(comment.verifiedAt)}</span>
                              {/if}
                            </div>
                          {/if}
                          {#if comment.closure}
                            <div class="text-slate-600">
                              归档人：{comment.closure.closedByName}
                              {#if comment.closure.note}
                                <span class="ml-1">「{comment.closure.note}」</span>
                              {/if}
                            </div>
                          {/if}
                        </div>
                        <button
                          type="button"
                          onclick={() => handleJumpFromCommentToDiff(comment)}
                          class="mt-1 text-[9px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200"
                        >
                          🔗 跳转差异对比查看修改
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if showCreateModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick={() => showCreateModal = false}>
      <div class="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-bold text-gray-800 mb-3">📝 创建新版本</h3>
        <p class="text-xs text-gray-500 mb-3">将当前方案保存为一个版本快照，记录所有节点、缆绳和参数配置</p>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          版本备注（可选）
        </label>
        <textarea
          bind:value={newVersionNote}
          rows="3"
          placeholder="例如：调整主桅滑轮方向、增加右舷缆绳张力..."
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        ></textarea>
        <div class="flex gap-2 mt-4">
          <button
            type="button"
            onclick={() => showCreateModal = false}
            class="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="button"
            onclick={handleCreateVersion}
            class="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            disabled={!currentCanSave}
          >
            ✓ 创建版本
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showUserModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick={() => showUserModal = false}>
      <div class="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-bold text-gray-800 mb-3">👤 设置评审身份</h3>
        <p class="text-xs text-gray-500 mb-3">设置您的身份信息，用于标识您发表的评审批注</p>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          姓名/昵称
        </label>
        <input
          bind:value={tempUserName}
          placeholder="例如：张馆员"
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />
        <label class="block text-xs font-medium text-gray-700 mb-1">
          角色
        </label>
        <div class="grid grid-cols-2 gap-2">
          {#each ([
            { val: 'librarian', label: '馆员' },
            { val: 'modelist', label: '模型师' },
            { val: 'reviewer', label: '评审员' },
            { val: 'admin', label: '管理员' }
          ] as { val: ReviewUser['role']; label: string }[]) as roleItem}
            <button
              type="button"
              onclick={() => tempUserRole = roleItem.val}
              class="px-2 py-1.5 text-xs rounded border transition-colors {
                tempUserRole === roleItem.val
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }"
            >
              {roleItem.label}
            </button>
          {/each}
        </div>
        <div class="flex gap-2 mt-4">
          <button
            type="button"
            onclick={() => showUserModal = false}
            class="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="button"
            onclick={saveUserProfile}
            class="flex-1 px-3 py-2 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
          >
            ✓ 确认
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showResolveWithVersionModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick={() => showResolveWithVersionModal = false}>
      <div class="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-bold text-gray-800 mb-3">📌 指定解决版本</h3>
        <p class="text-xs text-gray-500 mb-3">标记该批注是在哪个版本中被解决的，可在时间回放中显示解决轨迹</p>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          解决版本
        </label>
        <select
          bind:value={resolvingVersionId}
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        >
          {#each sortedVersions as v}
            <option value={v.id}>
              v{v.versionNumber} · {v.note || formatDateTime(v.createdAt)}
            </option>
          {/each}
        </select>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          解决说明（可选）
        </label>
        <textarea
          bind:value={resolveNote}
          rows="2"
          placeholder="说明如何解决的..."
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        ></textarea>
        <div class="flex gap-2 mt-4">
          <button
            type="button"
            onclick={() => showResolveWithVersionModal = false}
            class="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="button"
            onclick={confirmResolveWithVersion}
            class="flex-1 px-3 py-2 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
            disabled={!resolvingVersionId}
          >
            ✓ 确认
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
