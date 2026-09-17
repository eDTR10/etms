// Generic helpers for editing a subtask tree of unlimited depth, shared by TaskForm's and
// TemplateForm's subtask editors. Both editable-subtask shapes differ slightly (task
// subtasks carry status/completion, template subtasks don't) but both are a `localKey`-
// keyed tree, so the tree-walking logic itself only needs that much in common.
interface TreeNode {
  localKey: string;
  subtasks: this[];
}

export function mapSubtaskTree<T extends TreeNode>(list: T[], localKey: string, fn: (item: T) => T): T[] {
  return list.map(item => item.localKey === localKey ? fn(item) : { ...item, subtasks: mapSubtaskTree(item.subtasks, localKey, fn) });
}

export function removeFromSubtaskTree<T extends TreeNode>(list: T[], localKey: string): T[] {
  return list.filter(item => item.localKey !== localKey).map(item => ({ ...item, subtasks: removeFromSubtaskTree(item.subtasks, localKey) }));
}

export function addChildToSubtaskTree<T extends TreeNode>(list: T[], parentKey: string | null, child: T): T[] {
  if (parentKey === null) return [...list, child];
  return list.map(item => item.localKey === parentKey ? { ...item, subtasks: [...item.subtasks, child] } : { ...item, subtasks: addChildToSubtaskTree(item.subtasks, parentKey, child) });
}

export function flattenTree<T extends { subtasks: T[] }>(list: T[]): T[] {
  return list.flatMap(item => [item, ...flattenTree(item.subtasks)]);
}
