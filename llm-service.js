// ================================================================
// LLM Service — Claude (Anthropic) API for voice transcript parsing
// ================================================================
class LLMService {
  constructor() {
    this.apiKey = localStorage.getItem("anthropic_api_key") || "";
    this.apiUrl = "https://api.anthropic.com/v1/messages";
    this.model = "claude-sonnet-4-20250514";
    this.lastError = null;
  }

  isConfigured() {
    return this.apiKey.length > 0;
  }

  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem("anthropic_api_key", key);
  }

  async testApiKey() {
    this.lastError = null;
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        this.lastError = `HTTP ${response.status}: ${body}`;
        return { ok: false, error: this.lastError };
      }
      return { ok: true };
    } catch (err) {
      this.lastError = err.message;
      return { ok: false, error: err.message };
    }
  }

  async parseVoiceInput(rawTranscript, existingTasks = []) {
    if (!this.isConfigured()) {
      return null;
    }

    const taskList = existingTasks
      .slice(0, 30)
      .map(
        (t) =>
          `- [${t.id}] "${t.title}" | ${t.date} | ${t.completed ? "done" : "pending"}${t.list ? " | list:" + t.list : ""}`,
      )
      .join("\n");

    const today = new Date().toISOString().split("T")[0];
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const prompt = `You are a voice-controlled task planner. Parse the command and return structured JSON.

Today: ${today} (${dayName})

Voice: "${rawTranscript}"
${taskList ? `\nExisting tasks:\n${taskList}` : ""}

Return JSON only, no markdown fences:
{"items":[{
  "type": "task|list|reminder",
  "action": "create|complete|delete|update|move",
  "title": "short title (max 6 words)",
  "matchedTask": "exact title of existing task or null",
  "matchedTaskId": "id of matched task or null",
  "date": "YYYY-MM-DD or null",
  "remindAt": "YYYY-MM-DDTHH:mm or null",
  "description": "description text or null",
  "listName": "list name or null"
}]}

Action guide:
- "add/create task X" → action:create
- "add X for tomorrow/yesterday/next Monday/March 15th" → action:create, date = resolved YYYY-MM-DD
- "delete/remove task X" → action:delete, match to existing task
- "complete/finish/done X" → action:complete, match to existing task
- "move X to tomorrow" → action:move, match existing, date = new date
- "add description to X: blah" → action:update, matchedTask, description = "blah"
- "update X to Y" → action:update, match existing, description = "Y"
- "I worked on X" / "I did X" / "worked on X today" → action:create, title = X, description = "worked on it". Treat as a new task log entry, NOT an update to an existing task unless X exactly matches an existing task title.
- "add X to list Y" → action:create, listName = Y (only when Y is a specific existing list name)
- "create list X" or "add X to my lists" or "add X to my list" or "add X list" → type:list, title = X
- "add X to my list/lists" ALWAYS means CREATE A NEW LIST named X (type:list), never a task
- Split multiple commands: "buy milk and call mom" → 2 items
- Resolve relative dates: yesterday, today, tomorrow, next Monday, this Friday, etc to YYYY-MM-DD
- If no date mentioned, date = null (will default to today)
- Match existing tasks by fuzzy similarity, not exact match
- For action:update, NEVER rename the matched task title. Keep the original title and put the new information in description.
- IMPORTANT: When user says "add X to my list" or "add X to my lists" or "add X to lists", they ALWAYS want to CREATE A NEW LIST named X (type:list, action:create). The word "list" at the end = list creation, NOT task creation.
- IMPORTANT: Status updates like "I worked on X", "I did X", "spent time on X" should use action:create to LOG it as a new task. Only use action:update if X EXACTLY matches an existing task title from the list above.
- IMPORTANT: "remind me to X" / "reminder to X" / "set reminder for X" / "don't forget to X" → type:reminder, action:create, title = X. If a time/date is mentioned (e.g. "at 3pm", "tomorrow morning", "in 2 hours"), set remindAt to resolved YYYY-MM-DDTHH:mm. If no time mentioned, set remindAt to null.
- Examples: "remind me to call doctor at 4pm" → type:reminder, title:"Call doctor", remindAt:"${today}T16:00". "remind me to buy groceries tomorrow" → type:reminder, title:"Buy groceries", remindAt:"<tomorrow>T09:00".`;

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.lastError = `HTTP ${response.status}: ${body}`;
        console.error("Claude API error:", this.lastError);
        throw new Error(this.lastError);
      }

      const data = await response.json();
      const content = data.content[0].text.trim();

      // Parse JSON from response (handle possible markdown wrapping)
      const jsonStr = content
        .replace(/^```json?\s*/, "")
        .replace(/\s*```$/, "");
      this.lastError = null;
      return JSON.parse(jsonStr);
    } catch (error) {
      this.lastError = error.message;
      console.error("Claude parsing error:", error);
      throw error;
    }
  }
}

const llm = new LLMService();
