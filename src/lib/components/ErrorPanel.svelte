<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import type { ValidationError } from '$lib/types';

  const store = editorStore;
  const { validationErrors, selectNode, selectRope, hasErrors } = store;

  let currentErrors = $derived($validationErrors ?? []);
  let currentHasErrors = $derived($hasErrors ?? false);

  function handleErrorClick(error: ValidationError) {
    if (error.type === 'node') {
      selectNode(error.id);
    } else if (error.type === 'rope' || error.type === 'path' || error.type === 'segment' || error.type === 'continuity') {
      selectRope(error.id);
    }
  }

  function getTypeLabel(type: string): string {
    switch (type) {
      case 'node':
        return '节点';
      case 'rope':
        return '缆绳';
      case 'path':
        return '路径';
      case 'segment':
        return '缆段';
      case 'continuity':
        return '连续性';
      default:
        return '未知';
    }
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'node':
        return 'bg-blue-100 text-blue-700';
      case 'rope':
        return 'bg-orange-100 text-orange-700';
      case 'path':
        return 'bg-purple-100 text-purple-700';
      case 'segment':
        return 'bg-pink-100 text-pink-700';
      case 'continuity':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }
</script>

<div class="bg-white border-t border-gray-200">
  <div class="p-2 flex items-center justify-between bg-gray-50 border-b">
    <h4 class="font-medium text-gray-700">
      {#if currentHasErrors}
        <span class="text-red-500">⚠</span> 验证错误
      {:else}
        <span class="text-green-500">✓</span> 验证通过
      {/if}
      <span class="text-gray-400 font-normal text-sm ml-2">
        ({currentErrors.length} 项)
      </span>
    </h4>
  </div>

  <div class="max-h-40 overflow-y-auto">
    {#if currentErrors.length === 0}
      <div class="p-4 text-center text-gray-500 text-sm">
        所有数据验证通过 · 路径连续 · 滑轮状态正常
      </div>
    {:else}
      <div class="divide-y divide-gray-100">
        {#each currentErrors as error}
          <button
            type="button"
            onclick={() => handleErrorClick(error)}
            class="w-full text-left p-2 hover:bg-gray-50 flex items-start gap-2 text-sm"
          >
            <span
              class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium {
                error.severity === 'error'
                  ? 'bg-red-100 text-red-600'
                  : 'bg-yellow-100 text-yellow-600'
              }"
            >
              {error.severity === 'error' ? '!' : '⚠'}
            </span>
            <div class="flex-1 min-w-0">
              <span
                class="text-xs px-1.5 py-0.5 rounded mr-1.5 {getTypeColor(error.type)}"
              >
                {getTypeLabel(error.type)}
                {#if error.segmentIndex !== undefined}
                  · 第{error.segmentIndex + 1}段
                {/if}
              </span>
              <span class="text-gray-700">{error.message}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
