<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import type { VersionSnapshot, VersionDiff, NodeDiff, RopeDiff } from '$lib/types';
  import { NODE_TYPE_LABELS, PULLEY_DIRECTION_LABELS, NODE_TYPE_COLORS } from '$lib/types';

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
    selectedRopeId
  } = store;

  let activeSubTab = $state<'list' | 'compare' | 'playback'>('list');
  let newVersionNote = $state('');
  let showCreateModal = $state(false);
  let playbackAutoPlay = $state(false);
  let playbackSpeed = $state(2000);
  let autoPlayTimer: number | null = null;

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
      reader.readAsText(file);
    };
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
</script>

<div class="flex flex-col h-full bg-white">
  <div class="flex border-b border-gray-200">
    <button
      type="button"
      onclick={() => activeSubTab = 'list'}
      class="flex-1 py-2 px-2 text-xs font-medium transition-colors {
        activeSubTab === 'list'
          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
          : 'text-gray-500 hover:text-gray-700'
      }"
    >
      📋 版本列表
    </button>
    <button
      type="button"
      onclick={() => activeSubTab = 'compare'}
      class="flex-1 py-2 px-2 text-xs font-medium transition-colors {
        activeSubTab === 'compare'
          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
          : 'text-gray-500 hover:text-gray-700'
      }"
    >
      🔍 差异对比
    </button>
    <button
      type="button"
      onclick={() => activeSubTab = 'playback'}
      class="flex-1 py-2 px-2 text-xs font-medium transition-colors {
        activeSubTab === 'playback'
          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
          : 'text-gray-500 hover:text-gray-700'
      }"
    >
      ▶ 时间回放
    </button>
  </div>

  <div class="p-2 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-1">
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
    {#if sortedVersions.length > 0 && !currentIsPlayback}
      <button
        type="button"
        onclick={handleClearAllVersions}
        class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors ml-auto"
      >
        清空
      </button>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if activeSubTab === 'list'}
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
                <div class="text-xs text-gray-700">
                  <div class="font-bold">v{vA.versionNumber}</div>
                  <div class="text-gray-500">{formatDateTime(vA.createdAt)}</div>
                  {#if vA.note}
                    <div class="text-gray-600 mt-1 line-clamp-2">{vA.note}</div>
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
                <div class="text-xs text-gray-700">
                  <div class="font-bold">v{vB.versionNumber}</div>
                  <div class="text-gray-500">{formatDateTime(vB.createdAt)}</div>
                  {#if vB.note}
                    <div class="text-gray-600 mt-1 line-clamp-2">{vB.note}</div>
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

        {#if diff}
          <div class="p-2 bg-gray-50 rounded border border-gray-200">
            <div class="text-xs font-bold text-gray-700 mb-2">📊 差异汇总</div>
            <div class="grid grid-cols-2 gap-1 text-xs">
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                新增节点: {diff.summary.addedNodes}
              </div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-red-500"></span>
                删除节点: {diff.summary.removedNodes}
              </div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                修改节点: {diff.summary.modifiedNodes}
              </div>
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                修改缆绳: {diff.summary.modifiedRopes}
              </div>
              <div class="col-span-2 mt-1 pt-1 border-t border-gray-200">
                <div>📏 总长度变化:
                  <span class={diff.summary.totalLengthDelta >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {diff.summary.totalLengthDelta >= 0 ? '+' : ''}{diff.summary.totalLengthDelta.toFixed(2)}m
                  </span>
                </div>
                <div>⚡ 总张力变化:
                  <span class={diff.summary.totalTensionDelta >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {diff.summary.totalTensionDelta >= 0 ? '+' : ''}{diff.summary.totalTensionDelta.toFixed(0)}N
                  </span>
                </div>
              </div>
            </div>
          </div>

          {#if diff.nodeDiffs.length > 0}
            <div class="space-y-1">
              <div class="text-xs font-bold text-gray-700">📍 节点变更 ({diff.nodeDiffs.length})</div>
              {#each diff.nodeDiffs as nd}
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
                </div>
              {/each}
            </div>
          {/if}

          {#if diff.ropeDiffs.length > 0}
            <div class="space-y-1">
              <div class="text-xs font-bold text-gray-700">〰 缆绳变更 ({diff.ropeDiffs.length})</div>
              {#each diff.ropeDiffs as rd}
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
                  {/if}
                  {#if rd.newRope}
                    <div class="text-xs text-gray-500 mt-1">
                      📏 {rd.newRope.totalLength.toFixed(1)}m · ⚡ {rd.newRope.tension}N · {rd.newRope.nodePath.length - 1}段
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
    {:else}
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
          {/if}

          <div class="space-y-1">
            <div class="text-xs font-bold text-gray-700">时间轴</div>
            <div class="space-y-1">
              {#each currentPlaybackSteps as step, idx}
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
                  </div>
                </button>
              {/each}
            </div>
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
</div>
