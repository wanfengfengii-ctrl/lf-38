<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import { ROPE_COLORS } from '$lib/types';

  const store = editorStore;
  const {
    selectedRopeId,
    ropes,
    nodes,
    ropePaths,
    updateRope,
    deleteRope
  } = store;

  let localLabel = $state('');
  let localTension = $state(0);
  let localColor = $state('');
  let localDescription = $state('');
  let tensionError = $state('');

  let currentSelectedRopeId = $derived($selectedRopeId ?? null);
  let currentRopes = $derived($ropes ?? new Map());
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopePaths = $derived($ropePaths ?? new Map());

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
        <span class="font-medium">{rope.label}</span>
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

        <div>
          <span class="block text-sm font-medium text-gray-700 mb-1">
            计算长度 (m)
          </span>
          <div class="px-3 py-2 bg-gray-100 rounded text-gray-700">
            {rope.length.toFixed(2)}
          </div>
          <p class="text-xs text-gray-500 mt-1">
            根据节点位置自动计算
          </p>
        </div>

        <div>
          <span class="block text-sm font-medium text-gray-700 mb-1">
            路径闭合
          </span>
          <div class="px-3 py-2 rounded {path?.isClosed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
            {path?.isClosed ? '✓ 路径闭合' : '✗ 路径断开'}
          </div>
        </div>

        <div>
          <label for="rope-color" class="block text-sm font-medium text-gray-700 mb-1">缆绳颜色</label>
          <div class="flex items-center gap-2 mb-2">
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

        <div>
          <span class="block text-sm font-medium text-gray-700 mb-1">连接节点</span>
          <div class="space-y-1 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-gray-500">起:</span>
              <span class="font-medium">
                {currentNodes.get(rope.source)?.label || rope.source}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">止:</span>
              <span class="font-medium">
                {currentNodes.get(rope.target)?.label || rope.target}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label for="rope-desc" class="block text-sm font-medium text-gray-700 mb-1">说明</label>
          <textarea
            id="rope-desc"
            value={localDescription}
            oninput={handleDescriptionChange}
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500}"
          ></textarea>
        </div>

        {#if path && path.errors.length > 0}
          <div class="p-3 bg-red-50 border border-red-200 rounded">
            <p class="text-sm font-medium text-red-800 mb-2">错误信息：</p>
            <ul class="text-sm text-red-700 space-y-1">
              {#each path.errors as error}
                <li>• {error}</li>
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
    </div>
  {/if}
{:else}
  <div class="p-4 text-gray-500 text-center">
    <p>选择一条缆绳查看属性</p>
  </div>
{/if}
