import { useCallback, useEffect, useRef, useState } from 'react';
import { createBoard, makeId, type Board } from './model';
import { loadWorkspace, STORAGE_KEY } from './storage';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(() =>
    loadWorkspace({
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    }),
  );
  const current = useRef(workspace);
  current.current = workspace;
  const [storageError, setStorageError] = useState(
    workspace.blocked ? workspace.warning || '自动保存已暂停' : '',
  );
  const [recoveryNotice, setRecoveryNotice] = useState(
    workspace.blocked ? '' : workspace.warning || '',
  );
  const [historyTick, setHistoryTick] = useState(0);
  const histories = useRef<Record<string, { past: Board[]; future: Board[] }>>(Object.create(null));
  const board = workspace.boards.find((b) => b.id === workspace.activeId)!;

  useEffect(() => {
    if (workspace.blocked) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ boards: workspace.boards, activeId: workspace.activeId }),
      );
      setStorageError('');
    } catch {
      setStorageError('本地存储空间不足或不可用。请点击「保存文件」备份，避免关闭后丢失更改。');
    }
  }, [workspace]);

  const checkpoint = useCallback(() => {
    const w = current.current;
    const b = w.boards.find((item) => item.id === w.activeId)!;
    const history = (histories.current[b.id] ??= { past: [], future: [] });
    history.past.push(structuredClone(b));
    if (history.past.length > 60) history.past.shift();
    history.future = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const updateBoard = useCallback(
    (change: Board | ((b: Board) => Board), record = true) => {
      if (record) checkpoint();
      setWorkspace((w) => ({
        ...w,
        boards: w.boards.map((b) =>
          b.id === w.activeId
            ? {
                ...(typeof change === 'function' ? change(b) : change),
                updatedAt: Date.now(),
              }
            : b,
        ),
      }));
    },
    [checkpoint],
  );

  const travel = useCallback((direction: 'past' | 'future') => {
    const w = current.current;
    const b = w.boards.find((item) => item.id === w.activeId)!;
    const h = histories.current[b.id];
    const next = h?.[direction].pop();
    if (!next) return;
    h[direction === 'past' ? 'future' : 'past'].push(structuredClone(b));
    setWorkspace((w) => ({
      ...w,
      boards: w.boards.map((item) =>
        item.id === b.id ? { ...next, updatedAt: Date.now() } : item,
      ),
    }));
    setHistoryTick((t) => t + 1);
  }, []);

  const activate = useCallback((activeId: string) => setWorkspace((w) => ({ ...w, activeId })), []);
  const append = useCallback((newBoard: Board) => {
    if (current.current.boards.length >= 100)
      throw new Error('最多保存 100 个画布，请先导出并删除不再使用的画布。');
    setWorkspace((w) => ({ ...w, boards: [...w.boards, newBoard], activeId: newBoard.id }));
  }, []);
  const add = useCallback(
    (kind: Board['kind'], name?: string) => append(createBoard(kind, name)),
    [append],
  );
  const duplicate = useCallback(() => {
    const w = current.current;
    const b = w.boards.find((item) => item.id === w.activeId)!;
    append({
      ...structuredClone(b),
      id: makeId(),
      name: `${b.name.slice(0, 115)} · 副本`,
      updatedAt: Date.now(),
    });
  }, [append]);
  const remove = useCallback(() => {
    const w = current.current;
    let boards = w.boards.filter((b) => b.id !== w.activeId);
    if (!boards.length) boards = [createBoard('mindmap', '未命名思维导图')];
    delete histories.current[w.activeId];
    setWorkspace({ ...w, boards, activeId: boards[0].id });
  }, []);
  void historyTick;
  return {
    boards: workspace.boards,
    board,
    activate,
    updateBoard,
    checkpoint,
    add,
    append,
    duplicate,
    remove,
    undo: () => travel('past'),
    redo: () => travel('future'),
    canUndo: !!histories.current[board.id]?.past.length,
    canRedo: !!histories.current[board.id]?.future.length,
    storageError,
    recoveryNotice,
    dismissRecoveryNotice: () => setRecoveryNotice(''),
  };
}
