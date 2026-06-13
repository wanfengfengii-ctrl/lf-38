<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import CytoscapeEditor from '$lib/components/CytoscapeEditor.svelte';
  import PropertyPanel from '$lib/components/PropertyPanel.svelte';
  import SidebarPanel from '$lib/components/SidebarPanel.svelte';
  import ErrorPanel from '$lib/components/ErrorPanel.svelte';
  import { editorStore } from '$lib/stores/editorStore';

  const { loadDemoData } = editorStore;

  onMount(() => {
    loadDemoData();
  });
</script>

<div class="flex flex-col h-screen bg-gray-100">
  <Toolbar />

  <div class="flex flex-1 overflow-hidden">
    <div class="w-64 flex-shrink-0 flex flex-col">
      <SidebarPanel />
    </div>

    <div class="flex-1 flex flex-col min-w-0">
      <div class="flex-1 relative">
        <CytoscapeEditor />
      </div>
      <ErrorPanel />
    </div>

    <PropertyPanel />
  </div>
</div>
