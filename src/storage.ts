import { createDemoBoards, makeId, readPersistedBoard, type Board } from './model';

export const STORAGE_KEY = 'zhitu.workspace.v1';
const MAX_BOARDS = 100;

export type LoadedWorkspace = {
  boards: Board[];
  activeId: string;
  warning?: string;
  blocked?: boolean;
};

type WorkspaceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function examples(): LoadedWorkspace {
  const boards = createDemoBoards();
  return { boards, activeId: boards[0].id };
}

/** Read documents independently, backing up the untouched original before any recovery. */
export function loadWorkspace(storage: WorkspaceStorage): LoadedWorkspace {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      ...examples(),
      blocked: true,
      warning: '无法读取本地存储，已暂停自动保存以保护旧记录。请先保存画布文件备份。',
    };
  }
  if (raw === null) return examples();

  const boards: Board[] = [];
  const ids = new Set<string>();
  let activeId: string | undefined;
  let needsRecovery = false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid workspace');
    const workspace = parsed as Record<string, unknown>;
    if (!Array.isArray(workspace.boards) || workspace.boards.length === 0)
      throw new Error('Invalid board list');
    if (workspace.boards.length > MAX_BOARDS) needsRecovery = true;
    for (const candidate of workspace.boards) {
      if (boards.length >= MAX_BOARDS) break;
      try {
        // Validate persisted fields directly: exportBoard would normalize damaged node types.
        const board = readPersistedBoard(candidate);
        let id = board.id;
        if (ids.has(id)) {
          needsRecovery = true;
          id = makeId('board');
          while (ids.has(id)) id = makeId('board');
        }
        ids.add(id);
        boards.push({ ...board, id });
      } catch {
        needsRecovery = true;
      }
    }
    activeId =
      typeof workspace.activeId === 'string' && ids.has(workspace.activeId)
        ? workspace.activeId
        : boards[0]?.id;
    if (activeId !== workspace.activeId) needsRecovery = true;
  } catch {
    needsRecovery = true;
  }

  const result: LoadedWorkspace = boards.length
    ? { boards, activeId: activeId ?? boards[0].id }
    : examples();
  if (!needsRecovery) return result;

  try {
    storage.setItem(`${STORAGE_KEY}.recovery.${Date.now()}`, raw);
  } catch {
    return {
      ...result,
      blocked: true,
      warning: `本地记录异常，已恢复 ${boards.length} 个有效画布，但原始记录备份失败。已暂停自动保存以防覆盖，请先保存画布文件备份。`,
    };
  }
  return {
    ...result,
    warning: `本地记录异常：已备份原始数据，并恢复 ${boards.length} 个有效画布。${boards.length ? '' : '现已打开示例画布。'}`,
  };
}
