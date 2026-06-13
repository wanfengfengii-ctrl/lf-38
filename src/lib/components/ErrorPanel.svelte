<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';

  const store = editorStore;
  const { validationErrors, selectNode, selectRope, hasErrors } = store;

  let currentErrors = $derived($validationErrors ?? []);
  let currentHasErrors = $derived($hasErrors ?? false);

  function handleErrorClick(error: { type: string; id: string }) {
    if (error.type === 'node' || error.type === 'path') {
      selectNode(error.id);
    } else if (error.type === 'rope') {
      selectRope(error.id);
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
        所有数据验证通过
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
                class="text-xs px-1.5 py-0.5 rounded mr-1.5 {
                  error.type === 'node'
                    ? 'bg-blue-100 text-blue-700'
                    : error.type === 'rope'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-purple-100 text-purple-700'
                }"
              >
                {error.type === 'node' ? '节点' : error.type === 'rope' ? '缆绳' : '路径'}
              </span>
              <span class="text-gray-700">{error.message}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
