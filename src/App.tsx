import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  MarkerType,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Copy,
  Diamond,
  Download,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Hand,
  LayoutGrid,
  ListTree,
  LoaderCircle,
  Maximize,
  Minus,
  MousePointer2,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Redo2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import { BoardNode, NodeEditorContext, NodeResizeContext } from './BoardNode';
import {
  createDemoBoards,
  exportBoard,
  layoutBoard,
  makeId,
  MAX_COORDINATE,
  MAX_FILE_BYTES,
  nodeSize,
  parseBoard,
  type Board,
  type BoardNode as NodeType,
  type NodeData,
} from './model';
import { downloadFile, exportPng, exportSvg } from './export';
import { useWorkspace } from './useWorkspace';

const nodeTypes = { boardNode: BoardNode };
const COLORS = ['#7864df', '#4b91de', '#45a891', '#dc9a46', '#db7296', '#788596'];
type Modal = 'new' | 'help' | 'rename' | 'delete' | 'templates' | null;
const kindNames: Record<NodeData['kind'], string> = {
  topic: '主题',
  process: '步骤',
  decision: '判断',
  note: '便签',
  text: '文字',
};

function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function App() {
  const w = useWorkspace();
  const { board, boards, updateBoard, checkpoint } = w;
  const flow = useReactFlow<NodeType>();
  const [tool, setTool] = useState<'select' | 'hand' | 'connect'>('select');
  const [modal, setModal] = useState<Modal>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [newKind, setNewKind] = useState<Board['kind']>('mindmap');
  const [menu, setMenu] = useState<'export' | 'board' | 'shapes' | null>(null);
  const [query, setQuery] = useState('');
  const [sidebar, setSidebar] = useState(true);
  const [inspector, setInspector] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldEdited = useRef(false);
  const selected = board.nodes.find((node) => node.selected);
  const selectedCount = board.nodes.filter((node) => node.selected).length;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    setMenu(null);
    setTool('select');
  }, [board.id]);

  const fit = useCallback(() => {
    void flow.fitView({ padding: 0.24, duration: 350, maxZoom: 1 });
  }, [flow]);
  const safe = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作未完成，请重试。');
    }
  };
  const selectOnly = (nodes: NodeType[], id: string) =>
    nodes.map((n) => ({ ...n, selected: n.id === id }));
  const setLabel = useCallback(
    (id: string, label: string) => {
      updateBoard((b) => ({
        ...b,
        nodes: b.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
      }));
    },
    [updateBoard],
  );

  const addNode = (kind: NodeData['kind'] = board.kind === 'mindmap' ? 'topic' : 'process') => {
    if (board.nodes.length >= 500) {
      notify('单个画布最多 500 个节点，请新建画布继续。');
      return;
    }
    const bounds = canvas.current?.getBoundingClientRect();
    const point = flow.screenToFlowPosition({
      x: (bounds?.left || 0) + (bounds?.width || 900) / 2,
      y: (bounds?.top || 0) + (bounds?.height || 600) / 2,
    });
    const size = nodeSize(kind);
    const node: NodeType = {
      id: makeId(),
      type: 'boardNode',
      position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
      data: { kind, color: kind === 'note' ? COLORS[3] : COLORS[0], label: `新${kindNames[kind]}` },
      style: size,
      selected: true,
    };
    updateBoard((b) => ({
      ...b,
      nodes: [...b.nodes.map((n) => ({ ...n, selected: false })), node],
    }));
    setMenu(null);
    setTool('select');
    notify('已添加，双击节点编辑文字');
  };

  const addRelated = (sibling = false) => {
    if (board.nodes.length >= 500) {
      notify('单个画布最多 500 个节点。');
      return;
    }
    if (board.edges.length >= 3000) {
      notify('单个画布最多 3000 条连线。');
      return;
    }
    let parent = selected || board.nodes[0];
    if (!parent) {
      addNode();
      return;
    }
    if (sibling) {
      const incoming = board.edges.find((e) => e.target === parent.id);
      if (!incoming) {
        notify('中心主题没有同级主题，请按 Tab 添加子主题。');
        return;
      }
      parent = board.nodes.find((n) => n.id === incoming.source)!;
    }
    const parentId = parent.id;
    const isRoot = !board.edges.some((e) => e.target === parentId);
    const color = isRoot
      ? COLORS[(board.edges.filter((e) => e.source === parentId).length + 1) % COLORS.length]
      : parent.data.color;
    const kind = board.kind === 'mindmap' ? 'topic' : 'process';
    const node: NodeType = {
      id: makeId(),
      type: 'boardNode',
      position: { x: parent.position.x + 270, y: parent.position.y },
      data: { label: board.kind === 'mindmap' ? '新主题' : '新步骤', kind, color },
      style: nodeSize(kind),
      selected: true,
    };
    updateBoard((b) =>
      layoutBoard({
        ...b,
        nodes: selectOnly([...b.nodes, node], node.id),
        edges: [
          ...b.edges,
          {
            id: makeId(),
            source: parentId,
            target: node.id,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'smoothstep',
            style: { stroke: color, strokeWidth: 2 },
            markerEnd: board.kind === 'flow' ? { type: MarkerType.ArrowClosed, color } : undefined,
          },
        ],
      }),
    );
    setTimeout(fit, 60);
  };

  const removeSelected = () => {
    const ids = new Set(board.nodes.filter((n) => n.selected).map((n) => n.id));
    if (!ids.size && !board.edges.some((e) => e.selected)) return;
    updateBoard((b) => ({
      ...b,
      nodes: b.nodes.filter((n) => !ids.has(n.id)),
      edges: b.edges.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)),
    }));
    notify('已删除，可按 Ctrl + Z 撤销');
  };

  const duplicateSelected = () => {
    const nodes = board.nodes.filter((n) => n.selected);
    if (!nodes.length) return;
    if (board.nodes.length + nodes.length > 500) {
      notify('单个画布最多 500 个节点。');
      return;
    }
    const ids = new Map(nodes.map((n) => [n.id, makeId()]));
    if (
      board.edges.length +
        board.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).length >
      3000
    ) {
      notify('单个画布最多 3000 条连线。');
      return;
    }
    updateBoard((b) => ({
      ...b,
      nodes: [
        ...b.nodes.map((n) => ({ ...n, selected: false })),
        ...nodes.map((n) => ({
          ...structuredClone(n),
          id: ids.get(n.id)!,
          position: { x: n.position.x + 36, y: n.position.y + 90 },
        })),
      ],
      edges: [
        ...b.edges,
        ...b.edges
          .filter((e) => ids.has(e.source) && ids.has(e.target))
          .map((e) => ({
            ...e,
            id: makeId(),
            source: ids.get(e.source)!,
            target: ids.get(e.target)!,
          })),
      ],
    }));
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<NodeType>[]) => {
      updateBoard((b) => ({ ...b, nodes: applyNodeChanges(changes, b.nodes) }), false);
    },
    [updateBoard],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      updateBoard(
        (b) => ({ ...b, edges: applyEdgeChanges(changes, b.edges) }),
        changes.some((c) => c.type === 'remove'),
      );
    },
    [updateBoard],
  );
  const connect = (connection: Connection) => {
    if (connection.source === connection.target) return;
    if (board.edges.length >= 3000) {
      notify('单个画布最多 3000 条连线。');
      return;
    }
    const color = board.nodes.find((n) => n.id === connection.target)?.data.color || COLORS[0];
    updateBoard((b) => ({
      ...b,
      edges: addEdge(
        {
          ...connection,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: b.kind === 'flow' ? { type: MarkerType.ArrowClosed, color } : undefined,
        },
        b.edges,
      ),
    }));
    setTool('select');
  };

  const saveDocument = () =>
    safe(async () => {
      setMenu(null);
      if (await downloadFile(`${board.name}.zhitu`, exportBoard(board), 'application/json'))
        notify('画布文件已保存，可随时导入继续编辑');
    });
  const importText = (text: string) => {
    try {
      const imported = parseBoard(text);
      w.append(imported);
      notify(`已导入「${imported.name}」`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '文件格式无效');
    }
  };
  const openDocument = () =>
    safe(async () => {
      if (window.desktop) {
        const file = await window.desktop.openFile();
        if (file) importText(file.content);
      } else fileInput.current?.click();
    });
  const exportImage = (format: 'svg' | 'png') =>
    safe(async () => {
      setMenu(null);
      setBusy(true);
      try {
        const content = format === 'svg' ? exportSvg(board) : await exportPng(board);
        if (
          await downloadFile(
            `${board.name}.${format}`,
            content,
            format === 'svg' ? 'image/svg+xml' : 'image/png',
          )
        )
          notify(`${format.toUpperCase()} 图片已导出`);
      } finally {
        setBusy(false);
      }
    });
  const autoLayout = () => {
    updateBoard(layoutBoard(board));
    setTimeout(fit, 60);
    notify('已自动整理节点与连线');
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const ctrl = event.ctrlKey || event.metaKey;
      const claim = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (ctrl && event.key.toLowerCase() === 's') {
        claim();
        void saveDocument();
        return;
      }
      if (ctrl && event.key.toLowerCase() === 'o') {
        claim();
        void openDocument();
        return;
      }
      if (event.key === 'Escape' && modal) {
        claim();
        setModal(null);
        return;
      }
      if (target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        setModal(null);
        setMenu(null);
        setTool('select');
        return;
      }
      if (modal) return;
      if (ctrl && event.key.toLowerCase() === 'z') {
        claim();
        if (event.shiftKey) w.redo();
        else w.undo();
      } else if (ctrl && event.key.toLowerCase() === 'y') {
        claim();
        w.redo();
      } else if (ctrl && event.key.toLowerCase() === 'd') {
        claim();
        duplicateSelected();
      } else if (ctrl && event.key.toLowerCase() === 'a') {
        claim();
        updateBoard(
          (b) => ({ ...b, nodes: b.nodes.map((n) => ({ ...n, selected: true })) }),
          false,
        );
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        claim();
        removeSelected();
      } else if (event.key === 'Tab' && selected && target.closest('.react-flow')) {
        claim();
        addRelated();
      } else if (event.key === 'Enter' && selected && target.closest('.react-flow')) {
        claim();
        addRelated(true);
      } else if (event.shiftKey && event.key === '!') {
        claim();
        fit();
      } else if (!ctrl && event.key.toLowerCase() === 'v') setTool('select');
      else if (!ctrl && event.key.toLowerCase() === 'h') setTool('hand');
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  });

  const showRename = () => {
    setNameDraft(board.name);
    setModal('rename');
    setMenu(null);
  };
  const create = () => {
    try {
      w.add(
        newKind,
        nameDraft.trim() || (newKind === 'mindmap' ? '未命名思维导图' : '未命名流程图'),
      );
      setModal(null);
      notify('新画布已创建，从一个想法开始吧');
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const selectedEdge = board.edges.find((e) => e.selected);

  return (
    <div className="app-shell">
      {sidebar && (
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Network size={23} strokeWidth={2.5} />
            </div>
            <div>
              <strong>
                知图<span>zhitu</span>
              </strong>
              <p>把想法连起来</p>
            </div>
          </div>
          <div className="workspace-badge">
            <div className="avatar">我</div>
            <div>
              <b>我的工作空间</b>
              <span>个人版 · 自由创作</span>
            </div>
            <ShieldCheck size={17} />
          </div>
          <button
            className="primary-button new-board"
            onClick={() => {
              setNameDraft('');
              setModal('new');
            }}
          >
            <Plus size={18} />
            新建画布<kbd>＋</kbd>
          </button>
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label="搜索画布"
              placeholder="搜索你的画布…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>⌕</span>
          </div>
          <div className="section-heading">
            我的画布<span>{boards.length.toString().padStart(2, '0')}</span>
          </div>
          <nav className="board-list" aria-label="我的画布">
            {boards
              .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
              .map((b) => (
                <button
                  key={b.id}
                  className={`board-item ${b.id === board.id ? 'selected' : ''}`}
                  onClick={() => w.activate(b.id)}
                >
                  <span className={`board-type-icon ${b.kind}`}>
                    {b.kind === 'mindmap' ? <GitBranch size={18} /> : <Blocks size={18} />}
                  </span>
                  <span>
                    <b>{b.name}</b>
                    <small>
                      {b.kind === 'mindmap' ? '思维导图' : '流程图'} · {b.nodes.length} 个节点
                    </small>
                  </span>
                  {b.id === board.id && <span className="active-dot" />}
                </button>
              ))}
            {!boards.some((b) => b.name.toLowerCase().includes(query.toLowerCase())) && (
              <p className="empty-search">没有找到相关画布</p>
            )}
          </nav>
          <button className="sidebar-link" onClick={() => setModal('templates')}>
            <LayoutGrid size={18} />
            从模板开始
            <ArrowUpRight size={15} />
          </button>
          <button className="sidebar-link" onClick={() => void openDocument()}>
            <FolderOpen size={18} />
            导入本地文件<span>.zhitu</span>
          </button>
          <div className="sidebar-bottom">
            <div className="local-card">
              <div>
                <ShieldCheck size={19} />
                <b>你的想法，只属于你</b>
              </div>
              <p>
                没有订阅，没有打扰。
                <br />
                所有画布都保存在这台设备。
              </p>
              <span>
                <i />
                离线也能安心创作
              </span>
            </div>
            <button className="help-link" onClick={() => setModal('help')}>
              <CircleHelp size={17} />
              使用帮助与快捷键<span>?</span>
            </button>
            <div className="app-version">
              知图个人版<span>v1.0.0</span>
            </div>
          </div>
        </aside>
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="document-title">
            <IconButton
              label={sidebar ? '收起侧栏' : '展开侧栏'}
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </IconButton>
            <span className="title-divider" />
            <div className="document-heading">
              <div className="breadcrumb">
                我的画布
                <ChevronRight size={12} />
                {board.kind === 'mindmap' ? '思维导图' : '流程图'}
              </div>
              <button className="title-button" onClick={showRename}>
                {board.name}
                <Pencil size={13} />
              </button>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`save-status ${w.storageError ? 'error' : ''}`}>
              <CheckCheck size={15} />
              {w.storageError ? '保存受限' : '已保存到本机'}
            </span>
            <button className="secondary-button save-button" onClick={() => void saveDocument()}>
              <ArrowDownToLine size={16} />
              保存文件
            </button>
            <div className="menu-anchor">
              <button
                className="primary-button export-button"
                onClick={() => setMenu(menu === 'export' ? null : 'export')}
                disabled={busy}
              >
                {busy ? <LoaderCircle size={16} className="spinning" /> : <Download size={16} />}
                导出
                <ChevronDown size={14} />
              </button>
              {menu === 'export' && (
                <div className="dropdown export-dropdown">
                  <span className="menu-label">让想法走出画布</span>
                  <button onClick={() => void exportImage('png')}>
                    <Download size={17} />
                    <span>
                      PNG 图片<small>适合分享与文档插图</small>
                    </span>
                    <span className="format-tag">PNG</span>
                  </button>
                  <button onClick={() => void exportImage('svg')}>
                    <Blocks size={17} />
                    <span>
                      SVG 矢量图<small>无损缩放，清晰呈现</small>
                    </span>
                    <span className="format-tag">SVG</span>
                  </button>
                  <hr />
                  <button onClick={() => void saveDocument()}>
                    <FilePlus2 size={17} />
                    <span>
                      可编辑画布<small>备份或换一台设备继续</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <div className="menu-anchor">
              <IconButton
                label="画布菜单"
                onClick={() => setMenu(menu === 'board' ? null : 'board')}
              >
                <MoreHorizontal size={20} />
              </IconButton>
              {menu === 'board' && (
                <div className="dropdown board-dropdown">
                  <button onClick={showRename}>
                    <Pencil size={16} />
                    重命名画布
                  </button>
                  <button
                    onClick={() => {
                      try {
                        w.duplicate();
                        setMenu(null);
                        notify('已创建画布副本');
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <Copy size={16} />
                    复制画布
                  </button>
                  <hr />
                  <button
                    className="danger"
                    onClick={() => {
                      setMenu(null);
                      setModal('delete');
                    }}
                  >
                    <Trash2 size={16} />
                    删除画布
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="canvas-toolbar">
          <div className="canvas-mode">
            <span className="mode-icon">
              {board.kind === 'mindmap' ? <GitBranch size={17} /> : <Blocks size={17} />}
            </span>
            <b>{board.kind === 'mindmap' ? '思维导图' : '流程图'}</b>
            <span className="mode-subtitle">
              {board.kind === 'mindmap' ? '让思路自然生长' : '让每一步清晰可见'}
            </span>
          </div>
          <div className="canvas-utilities">
            <button onClick={autoLayout}>
              <ListTree size={16} />
              自动排版
            </button>
            <span className="utility-divider" />
            <IconButton label="撤销 (Ctrl+Z)" onClick={w.undo} disabled={!w.canUndo}>
              <Undo2 size={18} />
            </IconButton>
            <IconButton label="重做 (Ctrl+Shift+Z)" onClick={w.redo} disabled={!w.canRedo}>
              <Redo2 size={18} />
            </IconButton>
            <span className="utility-divider" />
            <IconButton
              label="节点属性"
              active={inspector}
              onClick={() => setInspector(!inspector)}
            >
              <SlidersHorizontal size={18} />
            </IconButton>
          </div>
        </div>

        {w.storageError && (
          <div className="storage-warning" role="alert">
            {w.storageError}
          </div>
        )}
        {w.recoveryNotice && (
          <div className="storage-warning" role="alert">
            {w.recoveryNotice}
            <button onClick={w.dismissRecoveryNotice}>知道了</button>
          </div>
        )}
        <div className="canvas-area" ref={canvas}>
          <NodeEditorContext.Provider value={setLabel}>
            <NodeResizeContext.Provider value={checkpoint}>
              <ReactFlow<NodeType>
                key={board.id}
                nodes={board.nodes}
                edges={board.edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={connect}
                onNodeDragStart={checkpoint}
                onSelectionDragStart={checkpoint}
                onPaneClick={() => setMenu(null)}
                onMove={(_, viewport) => setZoom(viewport.zoom)}
                fitView
                fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
                minZoom={0.12}
                maxZoom={2.5}
                panOnDrag={tool === 'hand' ? true : [1, 2]}
                panOnScroll
                selectionOnDrag={tool === 'select'}
                nodesDraggable={tool === 'select'}
                nodesConnectable={tool !== 'hand'}
                deleteKeyCode={null}
                selectionKeyCode="Shift"
                multiSelectionKeyCode="Shift"
                nodeExtent={[
                  [-MAX_COORDINATE, -MAX_COORDINATE],
                  [MAX_COORDINATE, MAX_COORDINATE],
                ]}
                className={`flow-canvas tool-${tool}`}
                proOptions={{ hideAttribution: false }}
                defaultEdgeOptions={{ type: 'smoothstep', style: { strokeWidth: 2 } }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#d7dce7" />
                {minimap && (
                  <MiniMap
                    position="bottom-right"
                    nodeColor={(node) => node.data.color as string}
                    maskColor="rgba(245,246,251,.65)"
                    pannable
                    zoomable
                  />
                )}
              </ReactFlow>
            </NodeResizeContext.Provider>
          </NodeEditorContext.Provider>

          <div className="floating-tools" role="toolbar" aria-label="画布工具">
            <IconButton
              label="选择 (V)"
              active={tool === 'select'}
              onClick={() => setTool('select')}
            >
              <MousePointer2 size={20} />
            </IconButton>
            <IconButton label="抓手 (H)" active={tool === 'hand'} onClick={() => setTool('hand')}>
              <Hand size={20} />
            </IconButton>
            <span />
            <IconButton label="添加主题" onClick={() => addNode()}>
              <GitBranch size={20} />
            </IconButton>
            <div className="menu-anchor">
              <IconButton
                label="添加形状"
                active={menu === 'shapes'}
                onClick={() => setMenu(menu === 'shapes' ? null : 'shapes')}
              >
                <Square size={20} />
              </IconButton>
              {menu === 'shapes' && (
                <div className="dropdown shapes-dropdown">
                  <button onClick={() => addNode('process')}>
                    <Square size={16} />
                    流程步骤
                  </button>
                  <button onClick={() => addNode('decision')}>
                    <Diamond size={16} />
                    判断分支
                  </button>
                </div>
              )}
            </div>
            <IconButton
              label="添加连线"
              active={tool === 'connect'}
              onClick={() => {
                setTool('connect');
                notify('从节点边缘的圆点拖动到另一节点，即可连线');
              }}
            >
              <ArrowUpRight size={21} />
            </IconButton>
            <IconButton label="添加文字" onClick={() => addNode('text')}>
              <Type size={20} />
            </IconButton>
            <IconButton label="添加便签" onClick={() => addNode('note')}>
              <StickyNote size={20} />
            </IconButton>
          </div>

          <div className="canvas-label">
            <span className="canvas-label-dot" />
            自由画布<span>·</span>
            {board.nodes.length} 个节点
          </div>
          {board.nodes.length === 0 && (
            <div className="empty-canvas">
              <div>
                <Sparkles size={32} />
              </div>
              <h2>每个清晰的想法，都从这里开始</h2>
              <p>添加第一个主题，把脑海里的灵感变成看得见的思路。</p>
              <button className="primary-button" onClick={() => addNode()}>
                <Plus size={17} />
                添加第一个主题
              </button>
            </div>
          )}

          {inspector && selected && (
            <aside className="inspector">
              <div className="inspector-heading">
                <span>节点属性</span>
                <IconButton label="关闭属性" onClick={() => setInspector(false)}>
                  <X size={15} />
                </IconButton>
              </div>
              <div className="inspector-body">
                <span className="field-label">
                  {selectedCount > 1 ? `已选 ${selectedCount} 个 · 编辑第一个` : '文字内容'}
                </span>
                <textarea
                  aria-label="节点内容"
                  key={selected.id}
                  value={selected.data.label}
                  maxLength={500}
                  onFocus={() => {
                    fieldEdited.current = false;
                  }}
                  onChange={(e) => {
                    if (!fieldEdited.current) {
                      checkpoint();
                      fieldEdited.current = true;
                    }
                    updateBoard(
                      (b) => ({
                        ...b,
                        nodes: b.nodes.map((n) =>
                          n.id === selected.id
                            ? { ...n, data: { ...n.data, label: e.target.value } }
                            : n,
                        ),
                      }),
                      false,
                    );
                  }}
                />
                <span className="field-label">节点形状</span>
                <div className="shape-options">
                  {(['topic', 'process', 'decision', 'note', 'text'] as const).map((kind) => (
                    <button
                      key={kind}
                      title={kindNames[kind]}
                      aria-label={`形状：${kindNames[kind]}`}
                      className={selected.data.kind === kind ? 'selected' : ''}
                      onClick={() =>
                        updateBoard((b) => ({
                          ...b,
                          nodes: b.nodes.map((n) =>
                            n.id === selected.id
                              ? {
                                  ...n,
                                  width: nodeSize(kind).width,
                                  height: nodeSize(kind).height,
                                  style: nodeSize(kind),
                                  data: { ...n.data, kind },
                                }
                              : n,
                          ),
                        }))
                      }
                    >
                      {kind === 'decision' ? (
                        <Diamond size={17} />
                      ) : kind === 'note' ? (
                        <StickyNote size={17} />
                      ) : kind === 'text' ? (
                        <Type size={17} />
                      ) : kind === 'topic' ? (
                        <GitBranch size={17} />
                      ) : (
                        <Square size={17} />
                      )}
                    </button>
                  ))}
                </div>
                <span className="field-label">主题颜色</span>
                <div className="color-options">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      aria-label={`颜色 ${color}`}
                      className={selected.data.color === color ? 'selected' : ''}
                      style={{ background: color }}
                      onClick={() =>
                        updateBoard((b) => ({
                          ...b,
                          nodes: b.nodes.map((n) =>
                            n.selected ? { ...n, data: { ...n.data, color } } : n,
                          ),
                          edges: b.edges.map((e) =>
                            b.nodes.some((n) => n.selected && n.id === e.target)
                              ? { ...e, style: { ...e.style, stroke: color } }
                              : e,
                          ),
                        }))
                      }
                    >
                      {selected.data.color === color && <Check size={12} />}
                    </button>
                  ))}
                </div>
                <div className="inspector-separator" />
                <button className="inspector-action" onClick={() => addRelated()}>
                  <Plus size={16} />
                  添加子{board.kind === 'mindmap' ? '主题' : '步骤'}
                  <kbd>Tab</kbd>
                </button>
                <button className="inspector-action" onClick={() => addRelated(true)}>
                  <ArrowRight size={16} />
                  添加同级<kbd>Enter</kbd>
                </button>
                <div className="inspector-footer">
                  <button onClick={duplicateSelected}>
                    <Copy size={15} />
                    复制
                  </button>
                  <button className="danger" onClick={removeSelected}>
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              </div>
            </aside>
          )}
          {inspector && !selected && selectedEdge && (
            <aside className="inspector edge-inspector">
              <div className="inspector-heading">连线属性</div>
              <div className="inspector-body">
                <label className="field-label" htmlFor="edge-label">
                  连线文字
                </label>
                <input
                  id="edge-label"
                  value={String(selectedEdge.label || '')}
                  maxLength={100}
                  placeholder="例如：是 / 否"
                  onFocus={() => {
                    fieldEdited.current = false;
                  }}
                  onChange={(e) => {
                    if (!fieldEdited.current) {
                      checkpoint();
                      fieldEdited.current = true;
                    }
                    updateBoard(
                      (b) => ({
                        ...b,
                        edges: b.edges.map((edge) =>
                          edge.id === selectedEdge.id ? { ...edge, label: e.target.value } : edge,
                        ),
                      }),
                      false,
                    );
                  }}
                />
                <button className="inspector-action danger" onClick={removeSelected}>
                  <Trash2 size={16} />
                  删除连线
                </button>
              </div>
            </aside>
          )}

          {!selected && !selectedEdge && (
            <div className="quick-tip">
              <span className="tip-icon">
                <Zap size={17} />
              </span>
              <div>
                <b>思路，不必一次想完整</b>
                <p>双击节点编辑，拖动圆点连接想法</p>
              </div>
              <button title="查看快捷键" aria-label="查看快捷键" onClick={() => setModal('help')}>
                <ArrowUpRight size={17} />
              </button>
            </div>
          )}

          <div className="bottom-hint">
            {tool === 'hand' ? (
              <>
                <Hand size={14} />
                拖动画布，自由探索
              </>
            ) : (
              <>
                <MousePointer2 size={14} />
                拖动框选<span>·</span>右键拖动平移<span>·</span>
                <kbd>Tab</kbd>添加子主题
              </>
            )}
          </div>
          <div className="zoom-control">
            <IconButton label="缩小" onClick={() => void flow.zoomOut({ duration: 180 })}>
              <Minus size={17} />
            </IconButton>
            <button
              className="zoom-value"
              title="重置为 100%"
              onClick={() => void flow.zoomTo(1, { duration: 180 })}
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="放大" onClick={() => void flow.zoomIn({ duration: 180 })}>
              <Plus size={17} />
            </IconButton>
            <span />
            <IconButton label="适应画布" onClick={fit}>
              <Maximize size={17} />
            </IconButton>
            <IconButton label="显示缩略图" active={minimap} onClick={() => setMinimap(!minimap)}>
              <LayoutGrid size={17} />
            </IconButton>
          </div>
        </div>
        <footer className="statusbar">
          <span>
            <i />
            本地工作空间<span className="status-separator">/</span>
            {board.kind === 'mindmap' ? '思维导图' : '流程图'}
          </span>
          <span>
            <ShieldCheck size={12} />
            无需联网<span className="status-separator">·</span>专注于你的下一个好想法
          </span>
        </footer>
      </main>

      <input
        type="file"
        accept=".zhitu,.json"
        aria-label="导入画布文件"
        className="hidden-input"
        ref={fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            if (file.size > MAX_FILE_BYTES) notify('文件过大，请选择 2 MB 以内的画布文件');
            else void safe(async () => importText(await file.text()));
          }
          event.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal modal-${modal}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'new'
                ? '新建画布'
                : modal === 'help'
                  ? '使用帮助'
                  : modal === 'templates'
                    ? '画布模板'
                    : modal === 'rename'
                      ? '重命名画布'
                      : '删除画布'
            }
          >
            <IconButton label="关闭对话框" className="modal-close" onClick={() => setModal(null)}>
              <X size={20} />
            </IconButton>
            {modal === 'new' && (
              <>
                <div className="modal-icon">
                  <Sparkles size={25} />
                </div>
                <h2>一个想法，无限可能</h2>
                <p className="modal-intro">选一种方式，开始整理你的思路。</p>
                <div className="board-kind-options">
                  <button
                    className={newKind === 'mindmap' ? 'selected' : ''}
                    onClick={() => setNewKind('mindmap')}
                  >
                    <GitBranch size={28} />
                    <b>思维导图</b>
                    <span>发散思考，梳理知识</span>
                    {newKind === 'mindmap' && <Check size={15} />}
                  </button>
                  <button
                    className={newKind === 'flow' ? 'selected' : ''}
                    onClick={() => setNewKind('flow')}
                  >
                    <Blocks size={28} />
                    <b>流程图</b>
                    <span>拆解过程，清晰决策</span>
                    {newKind === 'flow' && <Check size={15} />}
                  </button>
                </div>
                <label className="field-label" htmlFor="board-name">
                  给画布起个名字
                </label>
                <input
                  id="board-name"
                  placeholder="例如：我的下一个计划"
                  maxLength={80}
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') create();
                  }}
                />
                <button className="primary-button modal-submit" onClick={create}>
                  创建画布
                  <ArrowRight size={17} />
                </button>
              </>
            )}
            {modal === 'rename' && (
              <>
                <div className="modal-icon">
                  <Pencil size={25} />
                </div>
                <h2>重命名画布</h2>
                <p className="modal-intro">一个好名字，让想法更容易被找到。</p>
                <input
                  aria-label="画布名称"
                  value={nameDraft}
                  maxLength={80}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && nameDraft.trim()) {
                      updateBoard((b) => ({ ...b, name: nameDraft.trim() }));
                      setModal(null);
                    }
                  }}
                />
                <button
                  className="primary-button modal-submit"
                  disabled={!nameDraft.trim()}
                  onClick={() => {
                    updateBoard((b) => ({ ...b, name: nameDraft.trim() }));
                    setModal(null);
                  }}
                >
                  保存名称
                  <Check size={17} />
                </button>
              </>
            )}
            {modal === 'delete' && (
              <>
                <div className="modal-icon danger">
                  <Trash2 size={25} />
                </div>
                <h2>删除「{board.name}」？</h2>
                <p className="modal-intro">
                  删除整个画布无法撤销。你可以先保存一份 .zhitu 文件作为备份。
                </p>
                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setModal(null)}>
                    保留画布
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => {
                      w.remove();
                      setModal(null);
                      notify('画布已删除');
                    }}
                  >
                    确认删除
                  </button>
                </div>
              </>
            )}
            {modal === 'templates' && (
              <>
                <div className="modal-icon">
                  <LayoutGrid size={25} />
                </div>
                <h2>从一点启发开始</h2>
                <p className="modal-intro">用模板打个底，再把它变成你的想法。</p>
                <div className="template-grid">
                  {createDemoBoards().map((template, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        try {
                          w.append(template);
                          setModal(null);
                          notify('模板已添加，可以自由修改');
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      <div className={`template-illustration template-${index}`}>
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <b>{template.name}</b>
                      <p>
                        {template.kind === 'mindmap'
                          ? '拆解目标 · 让成长有迹可循'
                          : '从灵感到行动 · 每一步都清晰'}
                      </p>
                      <span className="template-use">
                        使用模板
                        <ArrowUpRight size={14} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === 'help' && (
              <>
                <div className="modal-icon">
                  <Command size={25} />
                </div>
                <h2>让灵感，顺手发生</h2>
                <p className="modal-intro">
                  双击编辑节点，拖动边缘圆点建立连线。所有内容自动保存在本机，建议定期保存文件备份。
                </p>
                <div className="shortcut-list">
                  {[
                    ['添加子主题', 'Tab'],
                    ['添加同级主题', 'Enter'],
                    ['撤销 / 重做', 'Ctrl + Z / Ctrl + Shift + Z'],
                    ['保存 / 导入文件', 'Ctrl + S / Ctrl + O'],
                    ['复制选中节点', 'Ctrl + D'],
                    ['删除节点或连线', 'Delete'],
                    ['选择 / 抓手工具', 'V / H'],
                    ['多选 / 适应画布', 'Shift + 点击 / Shift + 1'],
                  ].map(([label, key]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
                <p className="help-footnote">
                  <ShieldCheck size={15} />
                  知图不上传你的内容，不需要账号或订阅。
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
