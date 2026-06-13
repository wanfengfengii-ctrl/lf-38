<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import type { EditorMode, NodeType } from '$lib/types';
  import { NODE_TYPE_LABELS } from '$lib/types';

  const store = editorStore;
  const {
    mode,
    addingNodeType,
    ropeSourceId,
    clearSelection,
    clearAll,
    loadDemoData,
    exportScheme,
    importScheme,
    canSaveScheme,
    totalRopeLength,
    nodes,
    ropes,
    setMode
  } = store;

  let currentMode = $derived($mode ?? 'select');
  let currentAddingNodeType = $derived($addingNodeType ?? 'mast');
  let currentRopeSourceId = $derived($ropeSourceId ?? null);
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopes = $derived($ropes ?? new Map());
  let currentTotalLength = $derived($totalRopeLength ?? 0);
  let currentCanSave = $derived($canSaveScheme ?? false);

  const modes: { value: EditorMode; label: string; icon: string }[] = [
    { value: 'select', label: '选择', icon: '↖' },
    { value: 'addNode', label: '添加节点', icon: '⊕' },
    { value: 'addRope', label: '连接缆绳', icon: '〰' },
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

  function handleSaveCheck() {
    if (currentCanSave) {
      alert('✓ 方案验证通过，可以保存！');
    } else {
      alert('✗ 方案存在错误，请修复后再保存');
    }
  }

  function handleLoadDemo() {
    console.log('加载示例按钮被点击');
    loadDemoData();
  }
</script>

<div class="bg-white border-b border-gray-200 p-3">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div class="flex items-center gap-2">
      <h1 class="text-xl font-bold text-gray-800">⚓ 古船缆绳路径编辑器</h1>
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

      {#if currentMode === 'addRope' && currentRopeSourceId}
        <span class="text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded">
          点击目标节点完成连接
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <div class="text-sm text-gray-600 mr-4">
        <span class="font-medium">节点:</span> {currentNodes.size}
        <span class="mx-2">|</span>
        <span class="font-medium">缆绳:</span> {currentRopes.size}
        <span class="mx-2">|</span>
        <span class="font-medium">总长度:</span> {currentTotalLength.toFixed(1)}m
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
        onclick={handleSaveCheck}
        class="px-3 py-1.5 text-sm rounded transition-colors {
          currentCanSave
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-red-500 text-white hover:bg-red-600'
        }"
      >
        {currentCanSave ? '✓ 可保存' : '✗ 有错误'}
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
    <div class="mt-2 text-sm text-gray-600">
      提示：先点击起始节点，再点击目标节点创建缆绳连接
    </div>
  {:else if currentMode === 'delete'}
    <div class="mt-2 text-sm text-red-600">
      警告：点击节点或缆绳将其删除
    </div>
  {/if}
</div>
