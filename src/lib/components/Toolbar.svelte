<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import type { EditorMode, NodeType } from '$lib/types';
  import { NODE_TYPE_LABELS } from '$lib/types';

  const store = editorStore;
  const {
    mode,
    addingNodeType,
    ropeBuildingPath,
    clearSelection,
    clearAll,
    loadDemoData,
    exportScheme,
    importScheme,
    canSaveScheme,
    totalRopeLength,
    nodes,
    ropes,
    setMode,
    saveToLocalStorage,
    isDirty,
    lastSavedAt
  } = store;

  let currentMode = $derived($mode ?? 'select');
  let currentAddingNodeType = $derived($addingNodeType ?? 'mast');
  let currentRopeBuildingPath = $derived($ropeBuildingPath ?? []);
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopes = $derived($ropes ?? new Map());
  let currentTotalLength = $derived($totalRopeLength ?? 0);
  let currentCanSave = $derived($canSaveScheme ?? false);
  let currentIsDirty = $derived($isDirty ?? false);
  let currentLastSavedAt = $derived($lastSavedAt ?? null);

  const modes: { value: EditorMode; label: string; icon: string }[] = [
    { value: 'select', label: '选择', icon: '↖' },
    { value: 'addNode', label: '添加节点', icon: '⊕' },
    { value: 'addRope', label: '穿绕缆绳', icon: '〰' },
    { value: 'delete', label: '删除', icon: '✕' }
  ];

  const nodeTypes: { value: NodeType; label: string; color: string }[] = [
    { value: 'mast', label: '桅杆', color: '#8B4513' },
    { value: 'pulley', label: '滑轮', color: '#708090' },
    { value: 'mooring', label: '系索点', color: '#2E8B57' }
  ];

  function handleModeClick(m: EditorMode) {
    if (currentMode === m) {
      setMode('select');
    } else {
      setMode(m);
    }
  }

  function handleNodeTypeChange(e: Event) {
    addingNodeType.set((e.target as HTMLSelectElement).value as NodeType);
  }

  function handleClearAll() {
    if (confirm('确定要清空所有内容吗？此操作不可撤销。')) {
      clearAll();
    }
  }

  function handleExport() {
    const data = exportScheme();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rope-scheme-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const success = importScheme(content);
        if (!success) {
          alert('导入失败：文件格式不正确或包含错误数据');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleSave() {
    if (currentCanSave) {
      const success = saveToLocalStorage();
      if (success) {
        alert('✓ 方案已保存到本地');
      } else {
        alert('✗ 保存失败');
      }
    } else {
      alert('✗ 方案存在错误，请修复后再保存');
    }
  }

  function handleLoadDemo() {
    const hasContent = currentNodes.size > 0 || currentRopes.size > 0;
    if (hasContent) {
      if (!confirm('加载示例将覆盖当前所有内容，确定继续吗？')) {
        return;
      }
    }
    loadDemoData();
  }

  function formatSavedAt(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  }
</script>

<div class="bg-white border-b border-gray-200 p-3">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div class="flex items-center gap-2">
      <h1 class="text-xl font-bold text-gray-800">⚓ 古船缆绳穿绕路径编辑器</h1>
      {#if currentIsDirty}
        <span class="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
          ● 未保存
        </span>
      {:else if currentLastSavedAt}
        <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
          ✓ 已保存 {formatSavedAt(currentLastSavedAt)}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#each modes as m}
        <button
          type="button"
          onclick={() => handleModeClick(m.value)}
          class="px-3 py-1.5 rounded border text-sm font-medium transition-colors {
            currentMode === m.value
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
          }"
        >
          <span class="mr-1">{m.icon}</span>
          {m.label}
        </button>
      {/each}

      {#if currentMode === 'addNode'}
        <select
          value={currentAddingNodeType}
          onchange={handleNodeTypeChange}
          class="px-3 py-1.5 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {#each nodeTypes as nt}
            <option value={nt.value}>
              {nt.label}
            </option>
          {/each}
        </select>
      {/if}

      {#if currentMode === 'addRope'}
        {#if currentRopeBuildingPath.length === 0}
          <span class="text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded">
            点击起始节点开始穿绕
          </span>
        {:else}
          <span class="text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded">
            已选 {currentRopeBuildingPath.length} 个节点 · 点击画布空白或按完成按钮结束
          </span>
        {/if}
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <div class="text-sm text-gray-600 mr-4">
        <span class="font-medium">节点:</span> {currentNodes.size}
        <span class="mx-2">|</span>
        <span class="font-medium">缆绳:</span> {currentRopes.size}
        <span class="mx-2">|</span>
        <span class="font-medium">总长:</span> {currentTotalLength.toFixed(1)}m
      </div>

      <div class="h-6 w-px bg-gray-300"></div>

      <button
        type="button"
        onclick={handleLoadDemo}
        class="px-4 py-1.5 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
      >
        加载示例
      </button>

      <button
        type="button"
        onclick={handleImport}
        class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
      >
        导入
      </button>

      <button
        type="button"
        onclick={handleExport}
        class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
      >
        导出
      </button>

      <button
        type="button"
        onclick={handleSave}
        class="px-3 py-1.5 text-sm rounded transition-colors {
          currentCanSave
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-red-500 text-white hover:bg-red-600'
        }"
      >
        {currentCanSave ? (currentIsDirty ? '💾 保存' : '✓ 已保存') : '✗ 有错误'}
      </button>

      <button
        type="button"
        onclick={clearSelection}
        class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
      >
        取消选择
      </button>

      <button
        type="button"
        onclick={handleClearAll}
        class="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
      >
        清空
      </button>
    </div>
  </div>

  {#if currentMode === 'addNode'}
    <div class="mt-2 text-sm text-gray-600">
      提示：在画布上点击以添加
      <span class="font-medium">{NODE_TYPE_LABELS[currentAddingNodeType]}</span>
    </div>
  {:else if currentMode === 'addRope'}
    <div class="mt-2 text-sm text-gray-600 flex items-center gap-2">
      <span>
        提示：依次点击节点创建穿绕路径，支持经过多个桅杆/滑轮/系索点
      </span>
      {#if currentRopeBuildingPath.length >= 2}
        <button
          type="button"
          onclick={() => store.finishBuildingRope()}
          class="px-2 py-0.5 text-xs bg-green-500 text-white rounded hover:bg-green-600"
        >
          ✓ 完成穿绕
        </button>
        <button
          type="button"
          onclick={() => store.cancelBuildingRope()}
          class="px-2 py-0.5 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
        >
          取消
        </button>
      {/if}
    </div>
    {#if currentRopeBuildingPath.length > 0}
      <div class="mt-1 flex items-center gap-1 flex-wrap">
        <span class="text-xs text-gray-500">当前路径：</span>
        {#each currentRopeBuildingPath as nid, idx}
          {@const n = currentNodes.get(nid)}
          {#if n}
            <span class="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
              {n.label}
            </span>
            {#if idx < currentRopeBuildingPath.length - 1}
              <span class="text-gray-400 text-xs">→</span>
            {/if}
          {/if}
        {/each}
      </div>
    {/if}
  {:else if currentMode === 'delete'}
    <div class="mt-2 text-sm text-red-600">
      警告：点击节点或缆绳将其删除
    </div>
  {/if}
</div>
