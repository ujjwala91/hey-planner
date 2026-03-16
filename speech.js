// ================================================================
// Speech Manager — Web Speech API (Continuous, Push-to-Talk, Wake Word)
// ================================================================
class SpeechManager {
  constructor() {
    this.recognition = null;
    this.locale = localStorage.getItem("voice_locale") || "en-IN";
    this.isListening = false;
    this.isWakeWordMode = false;
    this.isPushToTalkMode = false;
    this.isContinuousMode = false;
    this._continuousSpeaking = false;
    this.stopWords = ["hola"];
    this.wakeWords = [
      "hey planner",
      "hi planner",
      "okay planner",
      "hey planer",
      "hey planr",
      "a planner",
      "hey plan",
      "hey plan her",
      "hey plan are",
      "he planner",
    ];
    this.transcript = "";
    this.lastWakeWordTime = 0;
    this.sessionActive = false;
    this._silenceTimer = null;
    this._restartTimer = null;
    this._lastResultTime = 0;
    this.phraseCorrections = [
      [/\bplaaner\b/gi, "planner"],
      [/\bplaner\b/gi, "planner"],
      [/\bplan her\b/gi, "planner"],
      [/\bplan are\b/gi, "planner"],
      [/\bmeeting only\b/gi, "meeting"],
      [/\btoday only\b/gi, "today"],
      [/\btomorrow only\b/gi, "tomorrow"],
      [/\bdo one thing\b/gi, ""],
      [/\bput one task\b/gi, "add task"],
      [/\bmake one task\b/gi, "add task"],
      [/\bshift it to\b/gi, "move it to"],
      [/\bmark it done\b/gi, "complete it"],
      [/\bda\b/gi, "the"],
      [/\bdha\b/gi, "the"],
      [/\bdee\b/gi, "the"],
      [/\bna\b/gi, ""],
      [/\blah\b/gi, ""],
      [/\bpa\b/gi, ""],
      [/\bamma\b/gi, ""],
      [/\banna\b/gi, ""],
      [/\bmacha\b/gi, ""],
    ];
    this.initRecognition();
  }

  // Initialize speech recognition
  initRecognition() {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.locale;
      this.recognition.maxAlternatives = 5;

      this.recognition.onresult = (event) => this.handleResult(event);
      this.recognition.onerror = (event) => this.handleError(event);
      this.recognition.onend = () => this.handleEnd();
    }
  }

  // Check if speech recognition is supported
  isSupported() {
    return this.recognition !== null;
  }

  setLocale(locale) {
    this.locale = locale || "en-IN";
    localStorage.setItem("voice_locale", this.locale);
    if (this.recognition) {
      this.recognition.lang = this.locale;
    }
  }

  normalizeTranscript(text) {
    let normalized = text || "";
    for (const [pattern, replacement] of this.phraseCorrections) {
      normalized = normalized.replace(pattern, replacement);
    }
    return normalized.replace(/\s+/g, " ").trim();
  }

  // ---- CONTINUOUS ALWAYS-ON MODE ----
  // Flow: wait for wake word → transcribe → stop word "hola" → process → back to waiting
  async startContinuousMode() {
    if (!this.recognition) return;
    if (this.isContinuousMode) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone permission denied:", err);
      this.onError && this.onError("not-allowed");
      return;
    }

    this.isContinuousMode = true;
    this.isPushToTalkMode = false;
    this.isWakeWordMode = false;
    this.sessionActive = false; // start in "waiting for wake word" state
    this._continuousSpeaking = false;
    this.transcript = "";
    this._lastResultTime = Date.now();

    try {
      this.recognition.start();
      this.isListening = true;
      this.onContinuousStart && this.onContinuousStart();
    } catch (error) {
      console.error("Error starting continuous mode:", error);
    }
  }

  stopContinuousMode() {
    this.isContinuousMode = false;
    this._continuousSpeaking = false;
    this.sessionActive = false;
    if (this._silenceTimer) clearTimeout(this._silenceTimer);
    this.stop();
    this.onContinuousStop && this.onContinuousStop();
  }

  // Called after processing finishes — go back to waiting for wake word
  _continuousResume() {
    if (!this.isContinuousMode) return;
    this.transcript = "";
    this._continuousSpeaking = false;
    this.sessionActive = false; // back to waiting for wake word
    if (this._silenceTimer) clearTimeout(this._silenceTimer);

    if (!this.isListening) {
      try {
        this.recognition.start();
        this.isListening = true;
      } catch (error) {
        // Already running
      }
    }
    this.onContinuousReady && this.onContinuousReady();
  }

  // ---- PUSH-TO-TALK MODE ----
  async startPushToTalk() {
    if (!this.recognition) return;
    if (this.isListening) {
      this.stopPushToTalk();
      return;
    }

    // Request mic permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone permission denied:", err);
      this.onError && this.onError("not-allowed");
      return;
    }

    this.isPushToTalkMode = true;
    this.isWakeWordMode = false;
    this.sessionActive = true;
    this.transcript = "";
    this._lastResultTime = Date.now();

    try {
      this.recognition.start();
      this.isListening = true;
      this.onStart && this.onStart();

      // Start silence detection
      this._startSilenceDetection(2500);
    } catch (error) {
      console.error("Error starting push-to-talk:", error);
    }
  }

  stopPushToTalk() {
    this.isPushToTalkMode = false;
    this.sessionActive = false;
    if (this._silenceTimer) clearTimeout(this._silenceTimer);

    const finalTranscript = this.transcript.trim();
    this.stop();
    this.onPushToTalkEnd && this.onPushToTalkEnd(finalTranscript);
  }

  _startSilenceDetection(timeout) {
    if (this._silenceTimer) clearTimeout(this._silenceTimer);
    this._silenceTimer = setTimeout(() => {
      if (this.isPushToTalkMode && this.sessionActive) {
        // Auto-stop after silence
        this.stopPushToTalk();
      }
    }, timeout);
  }

  // Start wake word listening (continuous background mode)
  async startWakeWordMode() {
    if (this.recognition && !this.isListening) {
      // Request mic permission first
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error("Microphone permission denied:", err);
        this.onError && this.onError("not-allowed");
        return;
      }
      this.isWakeWordMode = true;
      this.sessionActive = false;
      this.transcript = "";
      try {
        this.recognition.start();
        this.isListening = true;
        this.onWakeWordModeStart && this.onWakeWordModeStart();
      } catch (error) {
        console.error("Error starting wake word mode:", error);
      }
    }
  }

  // Stop wake word listening
  stopWakeWordMode() {
    this.isWakeWordMode = false;
    this.sessionActive = false;
    this.stop();
  }

  // Start listening (manual mode)
  start() {
    if (this.recognition && !this.isListening) {
      this.transcript = "";
      this.isWakeWordMode = false;
      this.sessionActive = true;
      try {
        this.recognition.start();
        this.isListening = true;
        this.onStart && this.onStart();
      } catch (error) {
        console.error("Error starting recognition:", error);
      }
    }
  }

  // Stop listening
  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error("Error stopping recognition:", error);
      }
      this.isListening = false;
      this.onStop && this.onStop();
    }
  }

  // Check if text contains wake word
  containsWakeWord(text) {
    const normalized = text.toLowerCase().trim();
    return this.wakeWords.some((word) => normalized.includes(word));
  }

  // Extract command after wake word
  extractCommand(text) {
    const normalized = text.toLowerCase();
    for (const wakeWord of this.wakeWords) {
      const index = normalized.indexOf(wakeWord);
      if (index !== -1) {
        return text.substring(index + wakeWord.length).trim();
      }
    }
    return text;
  }

  // Strip all wake word phrases from text
  stripWakeWords(text) {
    let result = text;
    for (const wakeWord of this.wakeWords) {
      const regex = new RegExp(wakeWord, "gi");
      result = result.replace(regex, "");
    }
    return result.replace(/\s+/g, " ").trim() + " ";
  }

  // Handle recognition result
  handleResult(event) {
    let interimTranscript = "";
    let finalTranscript = "";
    this._lastResultTime = Date.now();

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        // Skip very low confidence results
        if (result[0].confidence > 0 && result[0].confidence < 0.3) {
          continue;
        }
        finalTranscript += this.normalizeTranscript(result[0].transcript) + " ";
      } else {
        interimTranscript += this.normalizeTranscript(result[0].transcript);
      }
    }

    // Continuous always-on mode
    if (this.isContinuousMode) {
      // Phase 1: Waiting for wake word
      if (!this.sessionActive) {
        let wakeWordFound = false;
        let commandAfterWake = "";

        // Check all alternatives for wake word
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          for (let alt = 0; alt < result.length; alt++) {
            const text = this.normalizeTranscript(
              result[alt].transcript,
            ).toLowerCase();
            if (this.containsWakeWord(text)) {
              wakeWordFound = true;
              if (result.isFinal) {
                commandAfterWake = this.extractCommand(
                  this.normalizeTranscript(result[alt].transcript),
                );
              }
              break;
            }
          }
          if (wakeWordFound) break;
        }

        // Also check combined text
        if (!wakeWordFound) {
          const fullText = (finalTranscript + interimTranscript).toLowerCase();
          if (this.containsWakeWord(fullText)) {
            wakeWordFound = true;
            if (finalTranscript) {
              commandAfterWake = this.extractCommand(finalTranscript);
            }
          }
        }

        if (wakeWordFound) {
          this.sessionActive = true;
          this._continuousSpeaking = false;
          this.transcript = "";
          if (commandAfterWake && commandAfterWake.trim().length > 0) {
            this.transcript =
              this.stripWakeWords(commandAfterWake.trim()) + " ";
          }
          this.onContinuousWakeWord && this.onContinuousWakeWord();
        }
        return;
      }

      // Phase 2: Session active — accumulate transcript, watch for stop word
      if (finalTranscript) {
        this.transcript += this.stripWakeWords(finalTranscript);
        this._continuousSpeaking = true;

        // Check for stop word in accumulated transcript
        const lower = this.transcript.toLowerCase();
        for (const sw of this.stopWords) {
          const idx = lower.lastIndexOf(sw);
          if (idx !== -1) {
            const captured = this.transcript.substring(0, idx).trim();
            this.transcript = "";
            this._continuousSpeaking = false;
            this.sessionActive = false;
            if (captured.length > 2) {
              this.onContinuousUtterance &&
                this.onContinuousUtterance(captured);
            } else {
              this.onContinuousReady && this.onContinuousReady();
            }
            break;
          }
        }
      }

      // Check interim for stop word (early feedback)
      let stopWordInInterim = false;
      if (interimTranscript) {
        const lowerInterim = interimTranscript.toLowerCase();
        stopWordInInterim = this.stopWords.some((sw) =>
          lowerInterim.includes(sw),
        );
      }

      this.onResult &&
        this.onResult({
          transcript: this.transcript,
          interimTranscript: stopWordInInterim
            ? "Processing..."
            : interimTranscript,
          isFinal: finalTranscript.length > 0,
        });
      return;
    }

    // Push-to-talk mode: accumulate transcript and show live
    if (this.isPushToTalkMode && this.sessionActive) {
      if (finalTranscript) {
        this.transcript += finalTranscript;
        // Reset silence timer on new speech
        this._startSilenceDetection(2500);
      }

      this.onResult &&
        this.onResult({
          transcript: this.transcript,
          interimTranscript,
          isFinal: finalTranscript.length > 0,
        });
      return;
    }

    // Wake word mode: listen for activation
    if (this.isWakeWordMode && !this.sessionActive) {
      // Check all alternatives for wake word (not just top result)
      let wakeWordFound = false;
      let commandAfterWake = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        for (let alt = 0; alt < result.length; alt++) {
          const text = this.normalizeTranscript(
            result[alt].transcript,
          ).toLowerCase();
          if (this.containsWakeWord(text)) {
            wakeWordFound = true;
            if (result.isFinal) {
              commandAfterWake = this.extractCommand(
                this.normalizeTranscript(result[alt].transcript),
              );
            }
            break;
          }
        }
        if (wakeWordFound) break;
      }

      // Also check combined text
      if (!wakeWordFound) {
        const fullText = (finalTranscript + interimTranscript).toLowerCase();
        if (this.containsWakeWord(fullText)) {
          wakeWordFound = true;
          if (finalTranscript) {
            commandAfterWake = this.extractCommand(finalTranscript);
          }
        }
      }

      if (wakeWordFound) {
        this.sessionActive = true;
        this.lastWakeWordTime = Date.now();
        this.transcript = "";
        if (commandAfterWake && commandAfterWake.trim().length > 0) {
          this.transcript = commandAfterWake.trim() + " ";
        }
        this.onWakeWordDetected && this.onWakeWordDetected();
        return;
      }
    }

    // Active session: process commands
    if (this.sessionActive || !this.isWakeWordMode) {
      if (finalTranscript) {
        // Strip any wake words that leak into transcript chunks
        this.transcript += this.stripWakeWords(finalTranscript);
      }

      this.onResult &&
        this.onResult({
          transcript: this.transcript,
          interimTranscript,
          isFinal: finalTranscript.length > 0,
        });

      // Auto-end session after silence in wake word mode
      if (this.isWakeWordMode && finalTranscript) {
        if (this._silenceTimer) clearTimeout(this._silenceTimer);
        this.lastWakeWordTime = Date.now();
        this._silenceTimer = setTimeout(() => {
          if (this.sessionActive) {
            this.endSession();
          }
        }, 2500);
      }
    }
  }

  // End current session
  endSession() {
    if (this.sessionActive) {
      this.sessionActive = false;
      this.onSessionEnd && this.onSessionEnd(this.transcript);
      this.transcript = "";
    }
  }

  // Handle recognition error
  handleError(event) {
    console.error("Speech recognition error:", event.error);
    if (
      (event.error === "no-speech" || event.error === "aborted") &&
      this.isContinuousMode
    ) {
      // In continuous mode, just restart silently
      this.isListening = false;
      setTimeout(() => {
        if (this.isContinuousMode) {
          this._continuousRestart();
        }
      }, 300);
    } else if (
      (event.error === "no-speech" || event.error === "aborted") &&
      this.isWakeWordMode
    ) {
      this.isListening = false;
      setTimeout(() => {
        if (this.isWakeWordMode) {
          this.startWakeWordMode();
        }
      }, 500);
    } else if (event.error === "no-speech" && this.isPushToTalkMode) {
      this.isListening = false;
      this.isPushToTalkMode = false;
      this.sessionActive = false;
      this.onPushToTalkEnd && this.onPushToTalkEnd("");
    } else if (event.error === "not-allowed") {
      this.isListening = false;
      this.isWakeWordMode = false;
      this.isPushToTalkMode = false;
      this.isContinuousMode = false;
      this.onError && this.onError(event.error);
    } else {
      this.isListening = false;
      this.onError && this.onError(event.error);
    }
  }

  _continuousRestart() {
    if (!this.isContinuousMode || this.isListening) return;
    try {
      this.recognition.start();
      this.isListening = true;
      this.sessionActive = true;
    } catch (e) {
      // already running
    }
  }

  // Handle recognition end
  handleEnd() {
    this.isListening = false;
    // Continuous mode — auto-restart
    if (this.isContinuousMode) {
      setTimeout(() => {
        if (this.isContinuousMode && !this.isListening) {
          this._continuousRestart();
        }
      }, 100);
      return;
    }
    // Restart if in wake word mode
    if (this.isWakeWordMode) {
      setTimeout(() => {
        if (this.isWakeWordMode && !this.isListening) {
          this.startWakeWordMode();
        }
      }, 100);
    }
    // If push-to-talk was still active when recognition ended unexpectedly
    if (this.isPushToTalkMode && this.sessionActive) {
      const finalTranscript = this.transcript.trim();
      this.isPushToTalkMode = false;
      this.sessionActive = false;
      this.onPushToTalkEnd && this.onPushToTalkEnd(finalTranscript);
    }
    this.onEnd && this.onEnd();
  }

  // Match transcript to existing tasks
  matchExistingTasks(transcript, existingTasks) {
    const normalized = transcript.toLowerCase().trim();
    const matches = [];

    existingTasks.forEach((task) => {
      const taskTitle = task.title.toLowerCase();
      const similarity = this.calculateSimilarity(normalized, taskTitle);

      // Check for keyword matches
      const taskWords = taskTitle.split(/\s+/).filter((w) => w.length > 3);
      const hasKeywordMatch = taskWords.some(
        (word) =>
          normalized.includes(word) || this.fuzzyMatch(normalized, word),
      );

      if (similarity > 0.6 || hasKeywordMatch) {
        matches.push({
          task,
          similarity,
          hasKeywordMatch,
        });
      }
    });

    // Sort by relevance
    matches.sort((a, b) => {
      if (a.hasKeywordMatch && !b.hasKeywordMatch) return -1;
      if (!a.hasKeywordMatch && b.hasKeywordMatch) return 1;
      return b.similarity - a.similarity;
    });

    return matches.length > 0 ? matches[0].task : null;
  }

  // Calculate similarity between two strings (0-1)
  calculateSimilarity(str1, str2) {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);

    let matchCount = 0;
    words1.forEach((word1) => {
      if (words2.some((word2) => this.fuzzyMatch(word1, word2))) {
        matchCount++;
      }
    });

    return matchCount / Math.max(words1.length, words2.length);
  }

  // Fuzzy match two words (handles typos)
  fuzzyMatch(word1, word2) {
    if (word1.length < 3 || word2.length < 3) {
      return word1 === word2;
    }

    if (word1.includes(word2) || word2.includes(word1)) {
      return true;
    }

    const distance = this.levenshteinDistance(word1, word2);
    const maxLength = Math.max(word1.length, word2.length);
    return distance / maxLength < 0.3;
  }

  // Calculate Levenshtein distance
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Parse transcript into tasks
  parseTasks(transcript) {
    const tasks = [];
    const normalized = transcript.toLowerCase().trim();

    // Pattern 1: "I worked on X", "I did X", "I completed X"
    const workPatterns = [
      /(?:i\s+)?(?:worked\s+on|did|completed|finished|fixed|updated|created|developed|implemented|built|wrote)\s+(.+?)(?:\.|,|and|$)/gi,
    ];

    // Pattern 2: Task list format
    const listPattern = /(?:^|\s)(?:task|todo|to-do)[\s:]*(.+?)(?:\.|$)/gi;

    // Pattern 3: Direct statements
    const directPattern =
      /([a-z\s]+(?:bug|feature|documentation|docs|code|test|meeting|call|email|review)[a-z\s]*)/gi;

    let matches;

    // Try work patterns
    workPatterns.forEach((pattern) => {
      pattern.lastIndex = 0;
      while ((matches = pattern.exec(normalized)) !== null) {
        const taskText = matches[1].trim();
        if (taskText.length > 3 && !this.isCommonPhrase(taskText)) {
          tasks.push(this.cleanTaskText(taskText));
        }
      }
    });

    // Try list pattern
    listPattern.lastIndex = 0;
    while ((matches = listPattern.exec(normalized)) !== null) {
      const items = matches[1].split(/,|\band\b/);
      items.forEach((item) => {
        const cleaned = item.trim();
        if (cleaned.length > 3) {
          tasks.push(this.cleanTaskText(cleaned));
        }
      });
    }

    // Try direct pattern if no tasks found yet
    if (tasks.length === 0) {
      directPattern.lastIndex = 0;
      while ((matches = directPattern.exec(normalized)) !== null) {
        const taskText = matches[1].trim();
        if (taskText.length > 5) {
          tasks.push(this.cleanTaskText(taskText));
        }
      }
    }

    // If still no tasks, split by common delimiters
    if (tasks.length === 0) {
      const sentences = normalized.split(/\.|,|and then|also|additionally/);
      sentences.forEach((sentence) => {
        const cleaned = sentence.trim();
        if (cleaned.length > 10 && !this.isCommonPhrase(cleaned)) {
          tasks.push(this.cleanTaskText(cleaned));
        }
      });
    }

    return [...new Set(tasks)].filter((t) => t.length > 0);
  }

  // Clean task text
  cleanTaskText(text) {
    let cleaned = text.replace(
      /^(?:i\s+)?(?:just|also|then|and|the|a|an)\s+/i,
      "",
    );

    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    cleaned = cleaned.replace(/[.,;:]$/, "");

    return cleaned;
  }

  // Check if text is a common phrase to ignore
  isCommonPhrase(text) {
    const commonPhrases = [
      "today",
      "yesterday",
      "tomorrow",
      "this morning",
      "this afternoon",
      "this evening",
      "nothing",
      "something",
      "anything",
      "i don't know",
      "i guess",
      "you know",
      "like",
      "umm",
      "uh",
    ];
    return commonPhrases.some(
      (phrase) => text.includes(phrase) && text.length < 15,
    );
  }

  // Get the final transcript
  getTranscript() {
    return this.transcript;
  }

  // Clear transcript
  clearTranscript() {
    this.transcript = "";
  }

  // Event handlers (to be set by the app)
  onStart = null;
  onStop = null;
  onResult = null;
  onError = null;
  onEnd = null;
  onWakeWordModeStart = null;
  onWakeWordDetected = null;
  onSessionEnd = null;
}

// Initialize speech manager
const speech = new SpeechManager();
