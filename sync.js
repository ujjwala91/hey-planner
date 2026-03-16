// ================================================================
// Sync Manager — cloud sync for Pro users via Supabase
// ================================================================
class SyncManager {
  constructor() {
    this.client = null;
  }

  init(supabaseClient) {
    this.client = supabaseClient;
  }

  _canSync() {
    return !!(this.client && auth.isLoggedIn() && auth.isPro());
  }

  // Push all local data to cloud (used when Pro user logs in for the first time)
  async pushAll(localData) {
    if (!this._canSync()) return;
    const userId = auth.user.id;

    const tasks = localData.tasks.map(t => ({
      id: t.id,
      user_id: userId,
      title: t.title,
      description: t.description || '',
      date: t.date || null,
      list_id: t.list || null,
      completed: t.completed || false,
      status: t.status || 'todo',
      remind_at: t.remindAt || null,
      created_at: t.createdAt || new Date().toISOString(),
      updated_at: t.updatedAt || new Date().toISOString(),
    }));

    const lists = localData.lists.map(l => ({
      id: l.id,
      user_id: userId,
      name: l.name,
      icon: l.icon || '📋',
      created_at: l.createdAt || new Date().toISOString(),
    }));

    await Promise.all([
      tasks.length > 0
        ? this.client.from('tasks').upsert(tasks, { onConflict: 'id' })
        : Promise.resolve(),
      lists.length > 0
        ? this.client.from('lists').upsert(lists, { onConflict: 'id' })
        : Promise.resolve(),
    ]);
  }

  // Pull all cloud data and return it
  async pullAll() {
    if (!this._canSync()) return null;
    const userId = auth.user.id;

    const [tasksRes, listsRes] = await Promise.all([
      this.client.from('tasks').select('*').eq('user_id', userId),
      this.client.from('lists').select('*').eq('user_id', userId),
    ]);

    if (tasksRes.error || listsRes.error) return null;

    const tasks = (tasksRes.data || []).map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      date: t.date || null,
      list: t.list_id || null,
      completed: t.completed || false,
      status: t.status || 'todo',
      remindAt: t.remind_at || null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    const lists = (listsRes.data || []).map(l => ({
      id: l.id,
      name: l.name,
      icon: l.icon || '📋',
      createdAt: l.created_at,
    }));

    return { tasks, lists };
  }

  // Sync a single task to cloud
  syncTask(task) {
    if (!this._canSync()) return;
    this.client.from('tasks').upsert({
      id: task.id,
      user_id: auth.user.id,
      title: task.title,
      description: task.description || '',
      date: task.date || null,
      list_id: task.list || null,
      completed: task.completed || false,
      status: task.status || 'todo',
      remind_at: task.remindAt || null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    }, { onConflict: 'id' });
  }

  // Delete a task from cloud
  deleteTask(taskId) {
    if (!this._canSync()) return;
    this.client.from('tasks').delete().eq('id', taskId).eq('user_id', auth.user.id);
  }

  // Sync a single list to cloud
  syncList(list) {
    if (!this._canSync()) return;
    this.client.from('lists').upsert({
      id: list.id,
      user_id: auth.user.id,
      name: list.name,
      icon: list.icon || '📋',
      created_at: list.createdAt,
    }, { onConflict: 'id' });
  }

  // Delete a list from cloud
  deleteList(listId) {
    if (!this._canSync()) return;
    this.client.from('tasks').delete().eq('list_id', listId).eq('user_id', auth.user.id);
    this.client.from('lists').delete().eq('id', listId).eq('user_id', auth.user.id);
  }
}

const sync = new SyncManager();
