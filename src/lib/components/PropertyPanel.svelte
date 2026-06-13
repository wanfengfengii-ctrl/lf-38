<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import NodePropertyPanel from './NodePropertyPanel.svelte';
  import RopePropertyPanel from './RopePropertyPanel.svelte';

  const store = editorStore;
  const { selectedNodeId, selectedRopeId } = store;

  let currentSelectedNodeId = $derived($selectedNodeId ?? null);
  let currentSelectedRopeId = $derived($selectedRopeId ?? null);
</script>

<div class="bg-white border-l border-gray-200 w-72 flex flex-col h-full overflow-hidden">
  <div class="p-2 bg-gray-50 border-b border-gray-200">
    <h3 class="font-medium text-gray-700">属性面板</h3>
  </div>
  <div class="flex-1 overflow-y-auto">
    {#if currentSelectedNodeId}
      <NodePropertyPanel />
    {:else if currentSelectedRopeId}
      <RopePropertyPanel />
    {:else}
      <div class="p-8 text-center text-gray-500">
        <div class="text-4xl mb-2">📋</div>
        <p class="text-sm">选择节点或缆绳</p>
        <p class="text-xs text-gray-400 mt-1">查看和编辑属性</p>
      </div>
    {/if}
  </div>
</div>
