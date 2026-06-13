<script lang="ts">
  import { editorStore } from '$lib/stores/editorStore';
  import { NODE_TYPE_LABELS, NODE_TYPE_COLORS, PULLEY_DIRECTION_LABELS } from '$lib/types';
  import type { NodeType, PulleyNode } from '$lib/types';

  const store = editorStore;
  const { nodes, ropes, ropePaths, selectedNodeId, selectNode, selectedRopeId, selectRope } = store;

  let activeTab = $state<'nodes' | 'ropes' | 'legend'>('nodes');
  let currentNodes = $derived($nodes ?? new Map());
  let currentRopes = $derived($ropes ?? new Map());
  let currentRopePaths = $derived($ropePaths ?? new Map());
  let currentSelectedNodeId = $derived($selectedNodeId ?? null);
  let currentSelectedRopeId = $derived($selectedRopeId ?? null);

  function getNodeIcon(type: NodeType): string {
    switch (type) {
      case 'mast':
        return '▮';
      case 'pulley':
        return '◯';
      case 'mooring':
        return '◆';
      default:
        return '●';
    }
  }

  function getRopePathSummary(ropeId: string): string {
    const rope = currentRopes.get(ropeId);
    if (!rope) return '';
    const labels: string[] = [];
    for (const cn of rope.nodePath) {
      const n = currentNodes.get(cn.nodeId);
      if (n) labels.push(n.label);
    }
    return labels.join(' → ');
  }
</script>

<div class="bg-white border-l border-gray-200 flex flex-col h-full">
  <div class="flex border-b border-gray-200">
    <button
      type="button"
      onclick={() => activeTab = 'nodes'}
      class="flex-1 py-2 px-3 text-sm font-medium transition-colors {
        activeTab === 'nodes'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-500 hover:text-gray-700'
      }"
    >
      节点 ({currentNodes.size})
    </button>
    <button
      type="button"
      onclick={() => activeTab = 'ropes'}
      class="flex-1 py-2 px-3 text-sm font-medium transition-colors {
        activeTab === 'ropes'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-500 hover:text-gray-700'
      }"
    >
      缆绳 ({currentRopes.size})
    </button>
    <button
      type="button"
      onclick={() => activeTab = 'legend'}
      class="flex-1 py-2 px-3 text-sm font-medium transition-colors {
        activeTab === 'legend'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-500 hover:text-gray-700'
      }"
    >
      图例
    </button>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if activeTab === 'nodes'}
      <div class="divide-y divide-gray-100">
        {#if currentNodes.size === 0}
          <div class="p-4 text-center text-gray-500 text-sm">
            暂无节点
          </div>
        {:else}
          {#each Array.from(currentNodes.values()).sort((a, b) => a.number - b.number) as node}
            <button
              type="button"
              onclick={() => selectNode(node.id)}
              class="w-full text-left p-2 hover:bg-gray-50 flex items-center gap-2 {
                currentSelectedNodeId === node.id ? 'bg-blue-50' : ''
              }"
            >
              <span
                class="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
                style="background-color: {NODE_TYPE_COLORS[node.type]}"
              >
                {node.number}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-800 truncate">
                  {node.label}
                </div>
                <div class="text-xs text-gray-500">
                  {NODE_TYPE_LABELS[node.type]}
                  {#if node.type === 'pulley'}
                    · {(node as PulleyNode).active ? '启用' : '停用'}
                    · {PULLEY_DIRECTION_LABELS[(node as PulleyNode).direction]}
                  {/if}
                </div>
              </div>
              <span class="text-gray-400 text-xs">
                {getNodeIcon(node.type)}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    {:else if activeTab === 'ropes'}
      <div class="divide-y divide-gray-100">
        {#if currentRopes.size === 0}
          <div class="p-4 text-center text-gray-500 text-sm">
            暂无缆绳
          </div>
        {:else}
          {#each Array.from(currentRopes.values()) as rope}
            {@const path = currentRopePaths.get(rope.id)}
            <button
              type="button"
              onclick={() => selectRope(rope.id)}
              class="w-full text-left p-2 hover:bg-gray-50 {
                currentSelectedRopeId === rope.id ? 'bg-blue-50' : ''
              }"
            >
              <div class="flex items-center gap-2">
                <span
                  class="w-3 h-3 rounded-full"
                  style="background-color: {path?.isValid ? rope.color : '#DC143C'}"
                ></span>
                <span class="text-sm font-medium text-gray-800 flex-1 truncate">
                  {rope.label}
                </span>
                <span
                  class="text-xs px-1.5 py-0.5 rounded {
                    path?.isValid
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }"
                >
                  {path?.isValid ? '有效' : '无效'}
                </span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                总长 {rope.totalLength.toFixed(1)}m · {rope.nodePath.length - 1} 段 · {rope.tension}N
              </div>
              <div class="text-xs text-gray-400 mt-0.5 truncate">
                {getRopePathSummary(rope.id)}
              </div>
              {#if path && !path.isContinuous}
                <div class="text-xs text-red-500 mt-0.5">
                  ⚠ 相邻节点连接断开
                </div>
              {/if}
              {#if path && !path.isClosed}
                <div class="text-xs text-yellow-600 mt-0.5">
                  ○ 首尾未闭合（开放路径）
                </div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    {:else}
      <div class="p-4 space-y-4">
        <div>
          <h5 class="font-medium text-gray-700 mb-2">节点类型</h5>
          <div class="space-y-2">
            {#each ['mast', 'pulley', 'mooring'] as type}
              <div class="flex items-center gap-2">
                <span
                  class="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
                  style="background-color: {NODE_TYPE_COLORS[type as NodeType]}"
                >
                  {getNodeIcon(type as NodeType)}
                </span>
                <span class="text-sm text-gray-700">
                  {NODE_TYPE_LABELS[type as NodeType]}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <div>
          <h5 class="font-medium text-gray-700 mb-2">缆绳状态</h5>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-6 h-1 bg-amber-600 rounded"></span>
              <span class="text-sm text-gray-700">正常缆绳</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-6 h-1 bg-red-600 rounded"></span>
              <span class="text-sm text-gray-700">错误缆绳</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-6 h-1 bg-amber-600 rounded" style="border-style: dashed;"></span>
              <span class="text-sm text-gray-700">相邻段连接断开</span>
            </div>
          </div>
        </div>

        <div>
          <h5 class="font-medium text-gray-700 mb-2">偏移点标记</h5>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded bg-cyan-500"></span>
              <span class="text-sm text-gray-700">🔵 入点 (Entry) - 缆绳进入节点位置</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded bg-red-500"></span>
              <span class="text-sm text-gray-700">🔴 出点 (Exit) - 缆绳离开节点位置</span>
            </div>
          </div>
        </div>

        <div>
          <h5 class="font-medium text-gray-700 mb-2">滑轮方向</h5>
          <div class="space-y-1 text-sm text-gray-600">
            <div>↻ 顺时针：仅允许向右/向下穿绕</div>
            <div>↺ 逆时针：仅允许向左/向上穿绕</div>
            <div>⇄ 双向：允许任意方向穿绕</div>
          </div>
        </div>

        <div class="p-3 bg-blue-50 rounded">
          <h5 class="font-medium text-blue-800 mb-1">使用说明</h5>
          <ul class="text-xs text-blue-700 space-y-1">
            <li>• 点击「添加节点」后在画布上点击放置</li>
            <li>• 点击「穿绕缆绳」后依次点击多个节点形成路径链</li>
            <li>• 选中缆绳后在右侧面板编辑逐段入点/出点偏移</li>
            <li>• 拖拽节点可移动位置，缆绳长度自动更新</li>
            <li>• 红色标识表示存在错误，点击错误项定位</li>
            <li>• 停用的滑轮显示为半透明，不参与路径</li>
            <li>• 所有修改自动触发校验与长度重算</li>
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>
