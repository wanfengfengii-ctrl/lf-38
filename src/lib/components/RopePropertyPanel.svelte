<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import {
    ROPE_COLORS,
    NODE_TYPE_LABELS,
    NODE_TYPE_COLORS,
    PULLEY_DIRECTION_LABELS,
    NODE_RADIUS
  } from '$lib/types';
  import type { PulleyNode, PathChainOffset } from '$lib/types';

  const store = editorStore;
  const {
    selectedRopeId,
    selectedPathNodeIndex,
    ropes,
    nodes,
    ropePaths,
    updateRope,
    deleteRope,
    updatePathNodeOffset,
    removeRopeNode,
    addRopeNode,
    reorderRopeNode,
    selectPathNodeIndex,
    addNodeToBuildingPath,
    mode
  } = store;

  let localLabel = $state('');
  let localTension = $state(0);
  let localColor = $state('');
  let localDescription = $state('');
  let tensionError = $state('');
  let addingNodeToPath = $state(false);

  let currentSelectedRopeId = $derived($selectedRopeId ?? null);
  let currentSelectedPathNodeIndex = $derived($selectedPathNodeIndex ?? null);
  let currentRopes = $derived($ropes ?? new Map());
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopePaths = $derived($ropePaths ?? new Map());
  let currentMode = $derived($mode ?? 'select');

  $effect(() => {
    const id = currentSelectedRopeId;
    if (!id) return;

    const rope = currentRopes.get(id);
    if (!rope) return;

    localLabel = rope.label;
    localTension = rope.tension;
    localColor = rope.color || '#CD853F';
    localDescription = rope.description || '';
    tensionError = '';
  });

  function validateTension(value: number): boolean {
    if (value <= 0) {
      tensionError = '张力必须大于 0';
      return false;
    }
    tensionError = '';
    return true;
  }

  function handleLabelChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    localLabel = value;
    const id = currentSelectedRopeId;
    if (id) updateRope(id, { label: value });
  }

  function handleTensionChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(value)) return;
    localTension = value;
    if (validateTension(value)) {
      const id = currentSelectedRopeId;
      if (id) updateRope(id, { tension: value });
    }
  }

  function handleColorChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    localColor = value;
    const id = currentSelectedRopeId;
    if (id) updateRope(id, { color: value });
  }

  function handleColorSelect(color: string) {
    localColor = color;
    const id = currentSelectedRopeId;
    if (id) updateRope(id, { color });
  }

  function handleDescriptionChange(e: Event) {
    const value = (e.target as HTMLTextAreaElement).value;
    localDescription = value;
    const id = currentSelectedRopeId;
    if (id) updateRope(id, { description: value });
  }

  function handleOffsetChange(
    pathIndex: number,
    isExit: boolean,
    axis: 'dx' | 'dy',
    valueStr: string
  ) {
    const value = parseFloat(valueStr);
    if (isNaN(value)) return;
    const id = currentSelectedRopeId;
    if (!id) return;

    const rope = currentRopes.get(id);
    if (!rope) return;

    const chainNode = rope.nodePath[pathIndex];
    if (!chainNode) return;

    const offset: PathChainOffset = isExit
      ? { ...chainNode.exitOffset, [axis]: value }
      : { ...chainNode.entryOffset, [axis]: value };

    updatePathNodeOffset(id, pathIndex, isExit, offset);
  }

  function handleRemovePathNode(pathIndex: number) {
    const id = currentSelectedRopeId;
    if (!id) return;
    const rope = currentRopes.get(id);
    if (!rope) return;
    if (rope.nodePath.length <= 2) {
      alert('路径至少需要 2 个节点');
      return;
    }
    if (!confirm(`确定要从路径中移除第 ${pathIndex + 1} 个节点吗？`)) return;
    removeRopeNode(id, pathIndex);
  }

  function handleMovePathNode(pathIndex: number, direction: -1 | 1) {
    const id = currentSelectedRopeId;
    if (!id) return;
    const rope = currentRopes.get(id);
    if (!rope) return;
    const newIndex = pathIndex + direction;
    if (newIndex < 0 || newIndex >= rope.nodePath.length) return;
    reorderRopeNode(id, pathIndex, newIndex);
  }

  function handleSelectPathNode(index: number) {
    selectPathNodeIndex(currentSelectedPathNodeIndex === index ? null : index);
  }

  function handleAddNodeToPath(nodeId: string) {
    const id = currentSelectedRopeId;
    if (!id) return;
    addRopeNode(id, nodeId);
    addingNodeToPath = false;
  }

  function getAvailableNodesToAdd(ropeId: string): string[] {
    const rope = currentRopes.get(ropeId);
    if (!rope) return [];
    const existingIds = new Set(rope.nodePath.map(n => n.nodeId));
    const result: string[] = [];
    for (const [id, node] of currentNodes) {
      if (!existingIds.has(id)) {
        if (node.type === 'pulley' && !(node as PulleyNode).active) continue;
        result.push(id);
      }
    }
    return result;
  }

  function resetOffset(pathIndex: number, isExit: boolean) {
    const id = currentSelectedRopeId;
    if (!id) return;
    updatePathNodeOffset(id, pathIndex, isExit, { dx: 0, dy: 0 });
  }

  function applyPresetOffset(
    pathIndex: number,
    isExit: boolean,
    preset: 'top' | 'bottom' | 'left' | 'right' | 'center'
  ) {
    const id = currentSelectedRopeId;
    if (!id) return;

    let offset: PathChainOffset = { dx: 0, dy: 0 };
    const r = NODE_RADIUS * 0.8;

    switch (preset) {
      case 'top':
        offset = { dx: 0, dy: -r };
        break;
      case 'bottom':
        offset = { dx: 0, dy: r };
        break;
      case 'left':
        offset = { dx: -r, dy: 0 };
        break;
      case 'right':
        offset = { dx: r, dy: 0 };
        break;
      case 'center':
        offset = { dx: 0, dy: 0 };
        break;
    }

    updatePathNodeOffset(id, pathIndex, isExit, offset);
  }

  function handleDelete() {
    const id = currentSelectedRopeId;
    if (id && confirm('确定要删除这条缆绳吗？')) {
      deleteRope(id);
    }
  }
</script>

{#if currentSelectedRopeId}
  {@const rope = currentRopes.get(currentSelectedRopeId)}
  {@const path = currentRopePaths.get(currentSelectedRopeId)}
  {#if rope}
    <div class="p-4 space-y-4">
      <h3 class="text-lg font-bold text-gray-800">缆绳属性</h3>

      <div class="flex items-center gap-2 p-2 bg-gray-100 rounded">
        <span
          class="w-3 h-3 rounded-full"
          style="background-color: {rope.color || '#CD853F'}"
        ></span>
        <span class="font-medium flex-1 truncate">{rope.label}</span>
        {#if path}
          <span
            class="text-xs px-2 py-0.5 rounded {path.isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}"
          >
            {path.isValid ? '有效' : '无效'}
          </span>
        {/if}
      </div>

      <div class="space-y-2">
        <div>
          <label for="rope-label" class="block text-sm font-medium text-gray-700 mb-1">缆绳名称</label>
          <input
            id="rope-label"
            type="text"
            value={localLabel}
            oninput={handleLabelChange}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
          />
        </div>

        <div>
          <label for="rope-tension" class="block text-sm font-medium text-gray-700 mb-1">
            张力 (N)
          </label>
          <input
            id="rope-tension"
            type="number"
            min="0.1"
            step="1"
            value={localTension}
            oninput={handleTensionChange}
            class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 {tensionError ? 'border-red-500' : 'border-gray-300'}"
          />
          {#if tensionError}
            <p class="text-red-500 text-xs mt-1">{tensionError}</p>
          {/if}
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="block text-sm font-medium text-gray-700 mb-1">
              总长度 (m)
            </span>
            <div class="px-3 py-2 bg-blue-50 rounded text-blue-700 font-mono text-sm">
              {rope.totalLength.toFixed(2)}
            </div>
          </div>
          <div>
            <span class="block text-sm font-medium text-gray-700 mb-1">
              段数
            </span>
            <div class="px-3 py-2 bg-gray-100 rounded text-gray-700 font-mono text-sm">
              {rope.nodePath.length - 1}
            </div>
          </div>
        </div>

        <div>
          <span class="block text-sm font-medium text-gray-700 mb-1">
            路径连续性
          </span>
          <div class="px-3 py-2 rounded {path?.isContinuous ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
            {path?.isContinuous ? '✓ 路径连续' : `✗ ${path?.continuityError || '路径断开'}`}
          </div>
        </div>

        <div>
          <label for="rope-color" class="block text-sm font-medium text-gray-700 mb-1">缆绳颜色</label>
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            {#each ROPE_COLORS as color}
              <button
                type="button"
                onclick={() => handleColorSelect(color)}
                class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 {localColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'}"
                style="background-color: {color}"
                title={color}
              ></button>
            {/each}
          </div>
          <input
            id="rope-color"
            type="color"
            value={localColor}
            oninput={handleColorChange}
            class="w-full h-10 rounded cursor-pointer"
          />
        </div>
      </div>

      <div class="pt-3 border-t">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-bold text-gray-800">穿绕路径链</h4>
          <button
            type="button"
            onclick={() => addingNodeToPath = !addingNodeToPath}
            class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {addingNodeToPath ? '取消添加' : '+ 添加节点'}
          </button>
        </div>

        {#if addingNodeToPath}
          {@const available = getAvailableNodesToAdd(currentSelectedRopeId)}
          <div class="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
            <p class="text-xs text-blue-700 mb-2">选择要添加到路径末尾的节点：</p>
            {#if available.length === 0}
              <p class="text-xs text-gray-500">没有可用的节点（请先添加节点或启用停用的滑轮）</p>
            {:else}
              <div class="space-y-1 max-h-32 overflow-y-auto">
                {#each available as nid}
                  {@const n = currentNodes.get(nid)}
                  {#if n}
                    <button
                      type="button"
                      onclick={() => handleAddNodeToPath(nid)}
                      class="w-full text-left px-2 py-1 text-xs rounded hover:bg-white flex items-center gap-2"
                    >
                      <span
                        class="w-4 h-4 rounded"
                        style="background-color: {NODE_TYPE_COLORS[n.type]}"
                      ></span>
                      <span class="flex-1 truncate">{n.label}</span>
                      <span class="text-gray-400">{NODE_TYPE_LABELS[n.type]}</span>
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <div class="space-y-2 max-h-96 overflow-y-auto">
          {#each rope.nodePath as chainNode, pathIndex}
            {@const node = currentNodes.get(chainNode.nodeId)}
            {@const isSelected = currentSelectedPathNodeIndex === pathIndex}
            {@const isFirst = pathIndex === 0}
            {@const isLast = pathIndex === rope.nodePath.length - 1}
            {@const segLen = path?.segments[pathIndex]?.length}
            {@const prevSegLen = pathIndex > 0 ? path?.segments[pathIndex - 1]?.length : undefined}
            {#if node}
              <div
                class="border rounded {isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}"
              >
                <div
                  class="p-2 cursor-pointer hover:bg-gray-50"
                  onclick={() => handleSelectPathNode(pathIndex)}
                >
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-gray-400 w-5">{pathIndex + 1}</span>
                    <span
                      class="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold"
                      style="background-color: {NODE_TYPE_COLORS[node.type]}"
                    >
                      {node.number}
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-gray-800 truncate">{node.label}</div>
                      <div class="text-xs text-gray-500">
                        {NODE_TYPE_LABELS[node.type]}
                        {#if node.type === 'pulley'}
                          · {(node as PulleyNode).active ? '启用' : '停用'}
                          · {PULLEY_DIRECTION_LABELS[(node as PulleyNode).direction]}
                        {/if}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      {#if !isFirst}
                        <button
                          type="button"
                          onclick={(e) => { e.stopPropagation(); handleMovePathNode(pathIndex, -1); }}
                          class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                          title="上移"
                        >↑</button>
                      {/if}
                      {#if !isLast}
                        <button
                          type="button"
                          onclick={(e) => { e.stopPropagation(); handleMovePathNode(pathIndex, 1); }}
                          class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                          title="下移"
                        >↓</button>
                      {/if}
                      <button
                        type="button"
                        onclick={(e) => { e.stopPropagation(); handleRemovePathNode(pathIndex); }}
                        class="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded"
                        title="移除"
                        disabled={rope.nodePath.length <= 2}
                      >✕</button>
                    </div>
                  </div>

                  {#if prevSegLen !== undefined}
                    <div class="mt-1 pl-7 text-xs text-gray-500">
                      ↑ 入段长度: <span class="font-mono text-gray-700">{prevSegLen.toFixed(2)}m</span>
                    </div>
                  {/if}
                  {#if segLen !== undefined}
                    <div class="pl-7 text-xs text-gray-500">
                      ↓ 出段长度: <span class="font-mono text-gray-700">{segLen.toFixed(2)}m</span>
                    </div>
                  {/if}
                </div>

                {#if isSelected}
                  <div class="px-2 pb-2 pt-1 border-t border-gray-200 space-y-2 bg-gray-50">
                    {#if !isFirst}
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-xs font-medium text-cyan-700">🔵 入点偏移 (Entry)</span>
                          <button
                            type="button"
                            onclick={() => resetOffset(pathIndex, false)}
                            class="text-xs text-gray-500 hover:text-gray-700"
                          >重置</button>
                        </div>
                        <div class="flex gap-1 mb-1">
                          {#each (['top', 'left', 'center', 'right', 'bottom'] as const) as preset}
                            <button
                              type="button"
                              onclick={() => applyPresetOffset(pathIndex, false, preset)}
                              class="flex-1 px-1 py-0.5 text-xs bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200"
                            >
                              {preset === 'top' ? '上' : preset === 'bottom' ? '下' : preset === 'left' ? '左' : preset === 'right' ? '右' : '中'}
                            </button>
                          {/each}
                        </div>
                        <div class="grid grid-cols-2 gap-1">
                          <div>
                            <label class="text-xs text-gray-500">DX</label>
                            <input
                              type="number"
                              step="1"
                              value={chainNode.entryOffset.dx}
                              oninput={(e) => handleOffsetChange(pathIndex, false, 'dx', (e.target as HTMLInputElement).value)}
                              class="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label class="text-xs text-gray-500">DY</label>
                            <input
                              type="number"
                              step="1"
                              value={chainNode.entryOffset.dy}
                              oninput={(e) => handleOffsetChange(pathIndex, false, 'dy', (e.target as HTMLInputElement).value)}
                              class="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                          </div>
                        </div>
                      </div>
                    {/if}

                    {#if !isLast}
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-xs font-medium text-red-600">🔴 出点偏移 (Exit)</span>
                          <button
                            type="button"
                            onclick={() => resetOffset(pathIndex, true)}
                            class="text-xs text-gray-500 hover:text-gray-700"
                          >重置</button>
                        </div>
                        <div class="flex gap-1 mb-1">
                          {#each (['top', 'left', 'center', 'right', 'bottom'] as const) as preset}
                            <button
                              type="button"
                              onclick={() => applyPresetOffset(pathIndex, true, preset)}
                              class="flex-1 px-1 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              {preset === 'top' ? '上' : preset === 'bottom' ? '下' : preset === 'left' ? '左' : preset === 'right' ? '右' : '中'}
                            </button>
                          {/each}
                        </div>
                        <div class="grid grid-cols-2 gap-1">
                          <div>
                            <label class="text-xs text-gray-500">DX</label>
                            <input
                              type="number"
                              step="1"
                              value={chainNode.exitOffset.dx}
                              oninput={(e) => handleOffsetChange(pathIndex, true, 'dx', (e.target as HTMLInputElement).value)}
                              class="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label class="text-xs text-gray-500">DY</label>
                            <input
                              type="number"
                              step="1"
                              value={chainNode.exitOffset.dy}
                              oninput={(e) => handleOffsetChange(pathIndex, true, 'dy', (e.target as HTMLInputElement).value)}
                              class="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                          </div>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              {#if !isLast && segLen !== undefined}
                <div class="flex items-center gap-2 pl-6 text-xs text-gray-400">
                  <div class="flex-1 h-px bg-gray-300"></div>
                  <span>{segLen.toFixed(2)} m</span>
                  <div class="flex-1 h-px bg-gray-300"></div>
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      </div>

      <div>
        <label for="rope-desc" class="block text-sm font-medium text-gray-700 mb-1">说明</label>
        <textarea
          id="rope-desc"
          value={localDescription}
          oninput={handleDescriptionChange}
          rows="2"
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
        ></textarea>
      </div>

      {#if path && (path.errors.length > 0 || path.pulleyDirectionErrors.length > 0 || path.inactivePulleyErrors.length > 0)}
        <div class="p-3 bg-red-50 border border-red-200 rounded space-y-1">
          <p class="text-sm font-medium text-red-800">错误信息：</p>
          <ul class="text-sm text-red-700 space-y-1">
            {#each path.errors as error}
              <li>• {error}</li>
            {/each}
            {#each path.inactivePulleyErrors as e}
              <li>• {e.error}</li>
            {/each}
            {#each path.pulleyDirectionErrors as e}
              <li>• {e.error}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <button
        type="button"
        onclick={handleDelete}
        class="w-full py-2 px-4 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
      >
        删除缆绳
      </button>
    </div>
  {/if}
{:else}
  <div class="p-4 text-gray-500 text-center">
    <p>选择一条缆绳查看属性</p>
  </div>
{/if}
