<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import type { MastNode, PulleyNode, MooringNode, PulleyDirection } from '$lib/types';
  import { NODE_TYPE_LABELS, PULLEY_DIRECTION_LABELS } from '$lib/types';

  const store = editorStore;
  const {
    selectedNodeId,
    nodes,
    updateNode,
    deleteNode,
    togglePulleyActive,
    setPulleyDirection,
    isNodeNumberAvailable
  } = store;

  let localNumber = $state(0);
  let localLabel = $state('');
  let localDescription = $state('');
  let localHeight = $state(0);
  let localDirection = $state<PulleyDirection>('bidirectional');
  let localSheaveCount = $state(1);
  let localLoadCapacity = $state(0);
  let numberError = $state('');

  let currentSelectedNodeId = $derived($selectedNodeId ?? null);
  let currentNodes = $derived($nodes ?? new Map());

  $effect(() => {
    const id = currentSelectedNodeId;
    if (!id) return;

    const node = currentNodes.get(id);
    if (!node) return;

    localNumber = node.number;
    localLabel = node.label;
    localDescription = node.description || '';

    if (node.type === 'mast') {
      localHeight = (node as MastNode).height || 0;
    } else if (node.type === 'pulley') {
      localDirection = (node as PulleyNode).direction;
      localSheaveCount = (node as PulleyNode).sheaveCount || 1;
    } else if (node.type === 'mooring') {
      localLoadCapacity = (node as MooringNode).loadCapacity || 0;
    }
    numberError = '';
  });

  function validateNumber(value: number): boolean {
    const id = currentSelectedNodeId;
    if (!id) return false;

    if (value <= 0) {
      numberError = '编号必须大于 0';
      return false;
    }

    if (!isNodeNumberAvailable(value, id)) {
      numberError = `编号 ${value} 已被使用`;
      return false;
    }

    numberError = '';
    return true;
  }

  function handleNumberChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (isNaN(value)) return;
    localNumber = value;
    if (validateNumber(value)) {
      const id = currentSelectedNodeId;
      if (id) updateNode(id, { number: value });
    }
  }

  function handleLabelChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    localLabel = value;
    const id = currentSelectedNodeId;
    if (id) updateNode(id, { label: value });
  }

  function handleDescriptionChange(e: Event) {
    const value = (e.target as HTMLTextAreaElement).value;
    localDescription = value;
    const id = currentSelectedNodeId;
    if (id) updateNode(id, { description: value });
  }

  function handleHeightChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(value)) return;
    localHeight = value;
    const id = currentSelectedNodeId;
    if (id) updateNode(id, { height: value } as Partial<MastNode>);
  }

  function handleDirectionChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as PulleyDirection;
    localDirection = value;
    const id = currentSelectedNodeId;
    if (id) setPulleyDirection(id, value);
  }

  function handleSheaveCountChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (isNaN(value) || value < 1) return;
    localSheaveCount = value;
    const id = currentSelectedNodeId;
    if (id) updateNode(id, { sheaveCount: value } as Partial<PulleyNode>);
  }

  function handleLoadCapacityChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(value)) return;
    localLoadCapacity = value;
    const id = currentSelectedNodeId;
    if (id) updateNode(id, { loadCapacity: value } as Partial<MooringNode>);
  }

  function handleToggleActive() {
    const id = currentSelectedNodeId;
    if (id) togglePulleyActive(id);
  }

  function handleDelete() {
    const id = currentSelectedNodeId;
    if (id && confirm('确定要删除这个节点吗？相关的缆绳也会被删除。')) {
      deleteNode(id);
    }
  }
</script>

{#if currentSelectedNodeId}
  {@const node = currentNodes.get(currentSelectedNodeId)}
  {#if node}
    <div class="p-4 space-y-4">
      <h3 class="text-lg font-bold text-gray-800">节点属性</h3>

      <div class="flex items-center gap-2 p-2 bg-gray-100 rounded">
        <span
          class="w-3 h-3 rounded-full"
          style="background-color: {node.type === 'mast' ? '#8B4513' : node.type === 'pulley' ? '#708090' : '#2E8B57'}"
        ></span>
        <span class="font-medium">{NODE_TYPE_LABELS[node.type]}</span>
        {#if node.type === 'pulley'}
          <span
            class="text-xs px-2 py-0.5 rounded {(node as PulleyNode).active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}"
          >
            {(node as PulleyNode).active ? '启用' : '停用'}
          </span>
        {/if}
      </div>

      <div class="space-y-2">
        <div>
          <label for="node-number" class="block text-sm font-medium text-gray-700 mb-1">节点编号</label>
          <input
            id="node-number"
            type="number"
            min="1"
            value={localNumber}
            oninput={handleNumberChange}
            class="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 {numberError ? 'border-red-500' : 'border-gray-300'}"
          />
          {#if numberError}
            <p class="text-red-500 text-xs mt-1">{numberError}</p>
          {/if}
        </div>

        <div>
          <label for="node-label" class="block text-sm font-medium text-gray-700 mb-1">节点名称</label>
          <input
            id="node-label"
            type="text"
            value={localLabel}
            oninput={handleLabelChange}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
          />
        </div>

        {#if node.type === 'mast'}
          <div>
            <label for="node-height" class="block text-sm font-medium text-gray-700 mb-1">桅杆高度 (m)</label>
            <input
              id="node-height"
              type="number"
              min="0"
              step="0.1"
              value={localHeight}
              oninput={handleHeightChange}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
            />
          </div>
        {/if}

        {#if node.type === 'pulley'}
          <div>
            <label for="node-direction" class="block text-sm font-medium text-gray-700 mb-1">滑轮方向</label>
            <select
              id="node-direction"
              value={localDirection}
              onchange={handleDirectionChange}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
            >
              {#each Object.entries(PULLEY_DIRECTION_LABELS) as [value, label]}
                <option value={value}>{label}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="node-sheave" class="block text-sm font-medium text-gray-700 mb-1">滑轮槽数</label>
            <input
              id="node-sheave"
              type="number"
              min="1"
              value={localSheaveCount}
              oninput={handleSheaveCountChange}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
            />
          </div>

          <div class="flex items-center gap-2">
            <label for="node-active" class="flex items-center gap-2 cursor-pointer">
              <input
                id="node-active"
                type="checkbox"
                checked={(node as PulleyNode).active}
                onchange={handleToggleActive}
                class="w-4 h-4"
              />
              <span class="text-sm font-medium text-gray-700">启用滑轮</span>
            </label>
          </div>
          <p class="text-xs text-gray-500">
            停用的滑轮不能参与缆绳路径计算
          </p>
        {/if}

        {#if node.type === 'mooring'}
          <div>
            <label for="node-load" class="block text-sm font-medium text-gray-700 mb-1">负载能力 (kg)</label>
            <input
              id="node-load"
              type="number"
              min="0"
              step="10"
              value={localLoadCapacity}
              oninput={handleLoadCapacityChange}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
            />
          </div>
        {/if}

        <div>
          <label for="node-desc" class="block text-sm font-medium text-gray-700 mb-1">说明</label>
          <textarea
            id="node-desc"
            value={localDescription}
            oninput={handleDescriptionChange}
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
          ></textarea>
        </div>

        <div class="pt-4 border-t">
          <span class="block text-sm font-medium text-gray-700 mb-1">位置</span>
          <p class="text-sm text-gray-600">
            X: {node.position.x.toFixed(0)}, Y: {node.position.y.toFixed(0)}
          </p>
          <p class="text-xs text-gray-500 mt-1">拖拽节点可移动位置</p>
        </div>

        <button
          type="button"
          onclick={handleDelete}
          class="w-full py-2 px-4 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          删除节点
        </button>
      </div>
    </div>
  {/if}
{:else}
  <div class="p-4 text-gray-500 text-center">
    <p>选择一个节点查看属性</p>
  </div>
{/if}
