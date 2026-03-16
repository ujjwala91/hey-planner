// ================================================================
// Storage Manager — LocalStorage CRUD for tasks, lists, and settings
// ================================================================
class StorageManager {
  constructor() {
    this.storageKey = "plannerData";
    this.data = this.loadData();
  }

  // ---------- Data Persistence ----------

  // Load data from localStorage
  loadData() {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      tasks: [],
      lists: [],
      settings: {},
    };
  }

  // Save data to localStorage
  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }

  // ---------- Task CRUD ----------

  // Add a new task
  addTask(task) {
    const newTask = {
      id: this.generateId(),
      title: task.title,
      description: task.description || "",
      date: task.date || this.getTodayDate(),
      list: task.list || null,
      completed: task.completed || false,
      status: task.status || "todo",
      remindAt: task.remindAt || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.tasks.push(newTask);
    this.saveData();
    if (typeof sync !== "undefined") sync.syncTask(newTask);
    return newTask;
  }

  // Update a task
  updateTask(taskId, updates) {
    const index = this.data.tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      this.data.tasks[index] = {
        ...this.data.tasks[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.saveData();
      if (typeof sync !== "undefined") sync.syncTask(this.data.tasks[index]);
      return this.data.tasks[index];
    }
    return null;
  }

  // Delete a task
  deleteTask(taskId) {
    this.data.tasks = this.data.tasks.filter((t) => t.id !== taskId);
    this.saveData();
    if (typeof sync !== "undefined") sync.deleteTask(taskId);
  }

  // Get tasks by date (excludes tasks assigned to sections)
  getTasksByDate(date) {
    return this.data.tasks.filter((t) => t.date === date && !t.list);
  }

  // Get tasks by list
  getTasksByList(listId) {
    return this.data.tasks.filter((t) => t.list === listId);
  }

  // Get all tasks
  getAllTasks() {
    return this.data.tasks;
  }

  // ---------- List / Section CRUD ----------

  // Add a new list
  addList(list) {
    const newList = {
      id: this.generateId(),
      name: list.name,
      icon: list.icon || "📋",
      createdAt: new Date().toISOString(),
    };
    this.data.lists.push(newList);
    this.saveData();
    if (typeof sync !== "undefined") sync.syncList(newList);
    return newList;
  }

  // Update a list
  updateList(listId, updates) {
    const index = this.data.lists.findIndex((l) => l.id === listId);
    if (index !== -1) {
      this.data.lists[index] = {
        ...this.data.lists[index],
        ...updates,
      };
      this.saveData();
      if (typeof sync !== "undefined") sync.syncList(this.data.lists[index]);
      return this.data.lists[index];
    }
    return null;
  }

  // Delete a list
  deleteList(listId) {
    // Also delete all tasks in this list
    this.data.tasks = this.data.tasks.filter((t) => t.list !== listId);
    this.data.lists = this.data.lists.filter((l) => l.id !== listId);
    this.saveData();
    if (typeof sync !== "undefined") sync.deleteList(listId);
  }

  // Get raw data object (for cloud sync)
  getRawData() {
    return this.data;
  }

  // Replace all local data with cloud data
  replaceData(data) {
    this.data = { tasks: data.tasks || [], lists: data.lists || [], settings: this.data.settings || {} };
    this.saveData();
  }

  // Get all lists
  getAllLists() {
    return this.data.lists;
  }

  // ---------- Markdown Import / Export ----------

  // Export data as markdown
  exportToMarkdown(date) {
    const tasks = this.getTasksByDate(date);
    let markdown = `# Tasks for ${date}\n\n`;

    if (tasks.length === 0) {
      markdown += "No tasks for this day.\n";
      return markdown;
    }

    // Group by completion status
    const completed = tasks.filter((t) => t.completed);
    const pending = tasks.filter((t) => !t.completed);

    if (pending.length > 0) {
      markdown += "## Pending Tasks\n\n";
      pending.forEach((task) => {
        markdown += `- [ ] ${task.title}\n`;
        if (task.description) {
          markdown += `  ${task.description}\n`;
        }
      });
      markdown += "\n";
    }

    if (completed.length > 0) {
      markdown += "## Completed Tasks\n\n";
      completed.forEach((task) => {
        markdown += `- [x] ${task.title}\n`;
        if (task.description) {
          markdown += `  ${task.description}\n`;
        }
      });
      markdown += "\n";
    }

    // Stats
    const completionRate = Math.round((completed.length / tasks.length) * 100);
    markdown += `## Summary\n\n`;
    markdown += `- Total tasks: ${tasks.length}\n`;
    markdown += `- Completed: ${completed.length}\n`;
    markdown += `- Pending: ${pending.length}\n`;
    markdown += `- Completion rate: ${completionRate}%\n`;

    return markdown;
  }

  // Download markdown file
  downloadMarkdown(date) {
    const markdown = this.exportToMarkdown(date);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import from markdown
  importFromMarkdown(markdown) {
    const lines = markdown.split("\n");
    const tasks = [];
    let currentDate = this.getTodayDate();

    lines.forEach((line) => {
      // Extract date from heading
      const dateMatch = line.match(/# Tasks for (\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        currentDate = dateMatch[1];
        return;
      }

      // Extract tasks
      const taskMatch = line.match(/- \[([ x])\] (.+)/);
      if (taskMatch) {
        const completed = taskMatch[1] === "x";
        const title = taskMatch[2];
        tasks.push({
          title,
          date: currentDate,
          completed,
        });
      }
    });

    // Add imported tasks
    tasks.forEach((task) => this.addTask(task));
    return tasks.length;
  }

  // ---------- Helpers & Stats ----------

  // Helper: Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Helper: Get today's date in YYYY-MM-DD format
  getTodayDate() {
    return this.formatLocalDate(new Date());
  }

  formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Helper: Format date for display
  formatDate(dateStr) {
    const date = new Date(dateStr + "T00:00:00");
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return date.toLocaleDateString("en-US", options);
  }

  // Get statistics for a date range
  getStats(startDate, endDate) {
    const tasks = this.data.tasks.filter((t) => {
      return t.date >= startDate && t.date <= endDate;
    });

    const completed = tasks.filter((t) => t.completed).length;
    const total = tasks.length;
    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending: total - completed,
      completionRate,
    };
  }
}

// Initialize storage manager
const storage = new StorageManager();
