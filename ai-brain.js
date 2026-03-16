// ================================================================
// AI Brain — Local NLP, grammar correction, and intent detection
// ================================================================
class AIBrain {
  constructor() {
    this.grammarRules = this.initGrammarRules();
    this.commonMistakes = this.initCommonMistakes();
    this.taskKeywords = [
      "task",
      "todo",
      "work",
      "project",
      "meeting",
      "call",
      "email",
      "code",
      "fix",
      "bug",
      "feature",
      "update",
      "create",
      "build",
    ];
  }

  // Initialize grammar correction rules
  initGrammarRules() {
    return [
      // Subject-verb agreement
      { pattern: /\b(i|he|she|it)\s+are\b/gi, replace: "$1 is" },
      { pattern: /\b(they|we|you)\s+is\b/gi, replace: "$1 are" },

      // Common verb tense fixes
      {
        pattern: /\b(he|she|it)\s+(work|fix|update|create|build)\b/gi,
        replace: "$1 $2s",
      },
      { pattern: /\bdid\s+(\w+)ed\b/gi, replace: "did $1" },
      { pattern: /\bdon't\s+(has|have)\b/gi, replace: "doesn't have" },

      // Article corrections
      { pattern: /\ba\s+([aeiou])/gi, replace: "an $1" },
      { pattern: /\ban\s+([^aeiou])/gi, replace: "a $1" },

      // Common typos and speech recognition errors
      { pattern: /\bteh\b/gi, replace: "the" },
      { pattern: /\badn\b/gi, replace: "and" },
      { pattern: /\bwrok\b/gi, replace: "work" },
      { pattern: /\bfinsih\b/gi, replace: "finish" },
    ];
  }

  // Initialize common speech-to-text mistakes
  initCommonMistakes() {
    return {
      their: "there",
      there: "their",
      to: "too",
      too: "to",
      your: "you're",
      "you're": "your",
      its: "it's",
      "it's": "its",
      then: "than",
      affect: "effect",
      accept: "except",
    };
  }

  // Main grammar correction function
  correctGrammar(text) {
    if (!text || text.trim().length === 0) return text;

    let corrected = text;

    // Apply grammar rules
    this.grammarRules.forEach((rule) => {
      corrected = corrected.replace(rule.pattern, rule.replace);
    });

    // Fix capitalization
    corrected = this.fixCapitalization(corrected);

    // Remove extra spaces
    corrected = corrected.replace(/\s+/g, " ").trim();

    // Add period at end if missing
    if (corrected && !/[.!?]$/.test(corrected)) {
      corrected += ".";
    }

    return corrected;
  }

  // Fix capitalization
  fixCapitalization(text) {
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);

    // Capitalize after periods
    text = text.replace(/\.\s+([a-z])/g, (match, letter) => {
      return ". " + letter.toUpperCase();
    });

    // Capitalize 'I'
    text = text.replace(/\bi\b/g, "I");

    return text;
  }

  // Understand intent from speech
  understandIntent(text) {
    const normalized = text.toLowerCase().trim();

    const intent = {
      type: "unknown",
      action: null,
      target: null,
      details: null,
      confidence: 0,
    };

    // Check for completion intent
    if (
      this.matchesPattern(normalized, [
        "completed",
        "finished",
        "done with",
        "wrapped up",
      ])
    ) {
      intent.type = "complete_task";
      intent.action = "complete";
      intent.confidence = 0.9;
      intent.target = this.extractTaskTarget(text);
    }
    // Check for update intent
    else if (
      this.matchesPattern(normalized, [
        "working on",
        "started",
        "began",
        "in progress",
      ])
    ) {
      intent.type = "update_task";
      intent.action = "update";
      intent.confidence = 0.85;
      intent.target = this.extractTaskTarget(text);
    }
    // Check for creation intent
    else if (
      this.matchesPattern(normalized, [
        "need to",
        "should",
        "have to",
        "must",
        "add task",
        "create task",
        "new task",
      ])
    ) {
      intent.type = "create_task";
      intent.action = "create";
      intent.confidence = 0.8;
      intent.target = this.extractTaskTarget(text);
    }
    // Check for logging intent (what I did)
    else if (
      this.matchesPattern(normalized, [
        "I did",
        "I worked on",
        "I fixed",
        "I updated",
        "I created",
        "I built",
      ])
    ) {
      intent.type = "log_completed";
      intent.action = "log";
      intent.confidence = 0.9;
      intent.target = this.extractTaskTarget(text);
    }
    // Default to logging if contains task keywords
    else if (this.containsTaskKeywords(normalized)) {
      intent.type = "log_completed";
      intent.action = "log";
      intent.confidence = 0.6;
      intent.target = text;
    }

    return intent;
  }

  // Check if text matches any pattern
  matchesPattern(text, patterns) {
    return patterns.some((pattern) => text.includes(pattern));
  }

  // Extract task target from text
  extractTaskTarget(text) {
    const normalized = text.toLowerCase();

    // Remove intent phrases
    const intentPhrases = [
      "i completed",
      "i finished",
      "i did",
      "i worked on",
      "i fixed",
      "i updated",
      "i created",
      "i built",
      "working on",
      "started",
      "need to",
      "should",
      "have to",
      "must",
      "done with",
      "wrapped up",
    ];

    let target = text;
    intentPhrases.forEach((phrase) => {
      const regex = new RegExp(phrase, "gi");
      target = target.replace(regex, "").trim();
    });

    return target;
  }

  // Check if text contains task-related keywords
  containsTaskKeywords(text) {
    return this.taskKeywords.some((keyword) => text.includes(keyword));
  }

  // Enhance task description
  enhanceTaskDescription(text) {
    let enhanced = this.correctGrammar(text);

    // Add context markers
    const timestamp = new Date().toLocaleString();

    return {
      original: text,
      corrected: enhanced,
      timestamp: timestamp,
      wordCount: enhanced.split(/\s+/).length,
    };
  }

  // Smart task title generation
  generateTaskTitle(text) {
    let title = this.extractTaskTarget(text);
    title = this.correctGrammar(title);

    // Capitalize important words
    const important = ["api", "ui", "ux", "db", "database", "bug", "feature"];
    important.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      title = title.replace(regex, word.toUpperCase());
    });

    // Limit length
    if (title.length > 60) {
      title = title.substring(0, 57) + "...";
    }

    return title;
  }

  // Suggest better phrasing
  suggestBetterPhrasing(text) {
    const suggestions = [];
    const normalized = text.toLowerCase();

    // Suggest more professional wording
    const improvements = [
      {
        pattern: /gonna/gi,
        suggestion: "going to",
        reason: "More professional",
      },
      {
        pattern: /wanna/gi,
        suggestion: "want to",
        reason: "More professional",
      },
      {
        pattern: /kinda/gi,
        suggestion: "kind of",
        reason: "More formal",
      },
      {
        pattern: /sorta/gi,
        suggestion: "sort of",
        reason: "More formal",
      },
    ];

    improvements.forEach((improvement) => {
      if (improvement.pattern.test(text)) {
        suggestions.push({
          original: text.match(improvement.pattern)[0],
          suggestion: improvement.suggestion,
          reason: improvement.reason,
        });
      }
    });

    return suggestions;
  }

  // Analyze sentiment and priority
  analyzeSentiment(text) {
    const normalized = text.toLowerCase();

    const analysis = {
      urgency: "normal",
      sentiment: "neutral",
      priority: 1,
    };

    // Check for urgency keywords
    const urgentWords = [
      "urgent",
      "asap",
      "immediately",
      "critical",
      "emergency",
      "now",
    ];
    const highPriorityWords = [
      "important",
      "priority",
      "must",
      "need",
      "required",
    ];

    if (urgentWords.some((word) => normalized.includes(word))) {
      analysis.urgency = "urgent";
      analysis.priority = 3;
      analysis.sentiment = "stressed";
    } else if (highPriorityWords.some((word) => normalized.includes(word))) {
      analysis.urgency = "high";
      analysis.priority = 2;
    }

    // Check for positive/negative sentiment
    const positiveWords = [
      "completed",
      "finished",
      "done",
      "success",
      "great",
      "excellent",
    ];
    const negativeWords = [
      "blocked",
      "stuck",
      "problem",
      "issue",
      "bug",
      "failed",
    ];

    if (positiveWords.some((word) => normalized.includes(word))) {
      analysis.sentiment = "positive";
    } else if (negativeWords.some((word) => normalized.includes(word))) {
      analysis.sentiment = "negative";
    }

    return analysis;
  }

  // Contextual understanding - learn from past inputs
  learnFromContext(previousTasks, currentInput) {
    const normalized = currentInput.toLowerCase();

    // Find related tasks
    const relatedTasks = previousTasks.filter((task) => {
      const taskWords = task.title.toLowerCase().split(/\s+/);
      const inputWords = normalized.split(/\s+/);

      // Check for word overlap
      const overlap = taskWords.filter((word) =>
        inputWords.some(
          (inputWord) => inputWord.length > 3 && word.includes(inputWord),
        ),
      );

      return overlap.length > 0;
    });

    // Provide context
    return {
      relatedTasks: relatedTasks,
      hasContext: relatedTasks.length > 0,
      suggestion:
        relatedTasks.length > 0
          ? `This might relate to: ${relatedTasks[0].title}`
          : null,
    };
  }

  // Process complete voice input with AI
  processVoiceInput(text, existingTasks = []) {
    // Step 1: Correct grammar
    const corrected = this.correctGrammar(text);

    // Step 2: Understand intent
    const intent = this.understandIntent(corrected);

    // Step 3: Analyze sentiment and priority
    const analysis = this.analyzeSentiment(corrected);

    // Step 4: Learn from context
    const context = this.learnFromContext(existingTasks, corrected);

    // Step 5: Generate task title if needed
    const taskTitle = this.generateTaskTitle(corrected);

    // Step 6: Get suggestions
    const suggestions = this.suggestBetterPhrasing(corrected);

    return {
      original: text,
      corrected: corrected,
      intent: intent,
      analysis: analysis,
      context: context,
      taskTitle: taskTitle,
      suggestions: suggestions,
      enhanced: this.enhanceTaskDescription(corrected),
    };
  }
}

// Initialize AI Brain
const aiBrain = new AIBrain();
