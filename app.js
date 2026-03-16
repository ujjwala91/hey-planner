// ================================================================
// Main Application Controller
// ================================================================
class PlannerApp {
  constructor() {
    this.currentView = "home";
    this.currentWeekStart = this.getWeekStart(new Date());
    this.currentCalendarDate = new Date();
    this.currentListId = null;
    this.editingTaskId = null;

    this.init();
  }

  // ============================================
  //  INITIALIZATION & SETUP
  // ============================================

  // Initialize the app
  init() {
    this.setupEventListeners();
    this.renderHeader();
    this.ensureRemindersSection();
    this.renderSidebar();
    this.renderHomeView();
    this.updateProgress();

    // Check speech recognition support
    if (!speech.isSupported()) {
      console.warn("Speech recognition not supported");
      document.getElementById("voiceFab").style.display = "none";
    }

    // Setup floating voice FAB (primary interaction)
    this.setupVoiceFab();

    // Start reminder notifications
    this.requestNotificationPermission();
    this.startReminders();

    // Initialize Supabase auth + cloud sync
    this.initSupabase();
  }

  // ============================================
  //  SUPABASE / AUTH / PRO
  // ============================================

  initSupabase() {
    if (
      typeof CONFIG === "undefined" ||
      !CONFIG.supabaseUrl ||
      CONFIG.supabaseUrl === "YOUR_SUPABASE_URL"
    ) return;

    const supabaseClient = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    auth.init(supabaseClient);
    sync.init(supabaseClient);

    auth.onChange(async (user, profile) => {
      this.updateAuthUI(user, profile);
      if (user && auth.isPro()) {
        await this.syncFromCloud();
      }
    });

    // Wire up auth button
    const authBtn = document.getElementById("authBtn");
    if (authBtn) {
      authBtn.addEventListener("click", () => {
        if (auth.isLoggedIn()) {
          if (confirm("Sign out?")) auth.signOut();
        } else {
          this.openAuthModal();
        }
      });
    }

    this.setupAuthModal();
    this.setupUpgradeModal();
  }

  updateAuthUI(user, profile) {
    const btn = document.getElementById("authBtn");
    if (!btn) return;
    if (user) {
      const isPro = auth.isPro();
      const onTrial = auth.isOnTrial();
      btn.textContent = isPro && !onTrial ? "⭐ Pro" : "👤 " + user.email.split("@")[0];
      btn.classList.toggle("is-pro", isPro && !onTrial);
    } else {
      btn.textContent = "Sign In";
      btn.classList.remove("is-pro");
    }
    this.updateTrialBanner();
  }

  updateTrialBanner() {
    const banner = document.getElementById("trialBanner");
    const bannerText = document.getElementById("trialBannerText");
    if (!banner) return;

    if (auth.isLoggedIn() && auth.isOnTrial()) {
      const days = auth.trialDaysLeft();
      bannerText.textContent = days <= 1
        ? "⚠️ Your free trial expires today — upgrade to keep Pro features!"
        : `🎉 ${days} days left in your free trial`;
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }

    // Wire up trial banner buttons (once)
    const upgradeBtn = document.getElementById("trialUpgradeBtn");
    const closeBtn = document.getElementById("trialBannerClose");
    if (upgradeBtn && !upgradeBtn._wired) {
      upgradeBtn._wired = true;
      upgradeBtn.addEventListener("click", () => this.showUpgradeModal());
    }
    if (closeBtn && !closeBtn._wired) {
      closeBtn._wired = true;
      closeBtn.addEventListener("click", () => banner.style.display = "none");
    }
  }

  async syncFromCloud() {
    try {
      const cloudData = await sync.pullAll();
      if (!cloudData) return;
      if (cloudData.tasks.length > 0 || cloudData.lists.length > 0) {
        storage.replaceData(cloudData);
      } else {
        await sync.pushAll(storage.getRawData());
      }
      this.renderSidebar();
      this.refreshCurrentView();
      this.updateProgress();
    } catch (e) {
      console.error("Cloud sync error:", e);
    }
  }

  openAuthModal() {
    document.getElementById("authModal").classList.add("active");
    document.getElementById("authEmail").value = "";
    document.getElementById("authPassword").value = "";
    document.getElementById("authError").classList.remove("visible");
  }

  setupAuthModal() {
    const modal = document.getElementById("authModal");
    if (!modal) return;

    const closeBtn = modal.querySelector(".close-btn");
    const cancelBtn = document.getElementById("cancelAuthBtn");
    const submitBtn = document.getElementById("submitAuthBtn");
    const tabs = modal.querySelectorAll(".auth-tab");
    const errorEl = document.getElementById("authError");
    const signupNote = document.getElementById("authSignupNote");
    let mode = "signin";

    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    cancelBtn.addEventListener("click", () => modal.classList.remove("active"));

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        mode = tab.dataset.tab;
        submitBtn.textContent = mode === "signin" ? "Sign In" : "Create Account";
        signupNote.style.display = mode === "signup" ? "block" : "none";
        errorEl.classList.remove("visible");
      });
    });

    submitBtn.addEventListener("click", async () => {
      const email = document.getElementById("authEmail").value.trim();
      const password = document.getElementById("authPassword").value;
      errorEl.classList.remove("visible");

      if (!email || !password) {
        errorEl.textContent = "Please enter your email and password.";
        errorEl.classList.add("visible");
        return;
      }

      submitBtn.disabled = true;
      try {
        if (mode === "signin") {
          await auth.signIn(email, password);
        } else {
          await auth.signUp(email, password);
          errorEl.textContent = "Check your email to confirm your account!";
          errorEl.style.color = "var(--success-color)";
          errorEl.classList.add("visible");
          submitBtn.disabled = false;
          return;
        }
        modal.classList.remove("active");
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.color = "var(--danger-color)";
        errorEl.classList.add("visible");
      }
      submitBtn.disabled = false;
    });
  }

  showUpgradeModal() {
    const modal = document.getElementById("upgradeModal");
    if (!modal) return;
    const priceEl = document.getElementById("upgradePrice");
    if (priceEl && typeof CONFIG !== "undefined") {
      priceEl.innerHTML = CONFIG.proPrice + ' <span>/month</span>';
    }
    modal.classList.add("active");
  }

  setupUpgradeModal() {
    const modal = document.getElementById("upgradeModal");
    if (!modal) return;

    modal.querySelector(".close-btn").addEventListener("click", () => modal.classList.remove("active"));
    document.getElementById("cancelUpgradeBtn").addEventListener("click", () => modal.classList.remove("active"));

    document.getElementById("upgradeBtn").addEventListener("click", () => {
      if (typeof CONFIG === "undefined" || !CONFIG.stripePaymentLink || CONFIG.stripePaymentLink === "YOUR_STRIPE_PAYMENT_LINK") {
        alert("Stripe payment link not configured yet.");
        return;
      }
      const userId = auth.user?.id ?? "";
      const url = CONFIG.stripePaymentLink + (userId ? `?client_reference_id=${userId}` : "");
      window.open(url, "_blank");
    });
  }

  // Ensure a built-in "Reminders" section exists
  ensureRemindersSection() {
    const lists = storage.getAllLists();
    let reminders = lists.find(
      (l) => l.name === "Reminders" && l.icon === "\uD83D\uDD14",
    );
    if (!reminders) {
      reminders = storage.addList({ name: "Reminders", icon: "\uD83D\uDD14" });
    }
    this.remindersListId = reminders.id;
  }

  // Request browser notification permission
  requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  // Start periodic reminder checks
  startReminders() {
    // Clear any existing interval
    if (this._reminderInterval) clearInterval(this._reminderInterval);

    const intervalMinutes = parseInt(
      localStorage.getItem("reminder_interval") || "15",
      10,
    );
    if (intervalMinutes <= 0) return;

    // Check immediately on start
    this.checkReminders();

    // Then check periodically
    this._reminderInterval = setInterval(
      () => {
        this.checkReminders();
      },
      intervalMinutes * 60 * 1000,
    );
  }

  // Check for pending reminders and notify
  checkReminders() {
    if (!this.remindersListId) return;
    const tasks = storage.getTasksByList(this.remindersListId);
    const now = new Date();

    // Only notify for uncompleted reminders whose remindAt time has passed
    const due = tasks.filter((t) => {
      if (t.completed) return false;
      if (!t.remindAt) return true; // No time set = always remind
      return new Date(t.remindAt) <= now;
    });
    if (due.length === 0) return;

    // Show browser notification if permitted
    if ("Notification" in window && Notification.permission === "granted") {
      const titles = due
        .slice(0, 5)
        .map((t) => "\u2022 " + t.title)
        .join("\n");
      const suffix = due.length > 5 ? `\n...and ${due.length - 5} more` : "";
      new Notification("\uD83D\uDD14 Hey Planner Reminders", {
        body: titles + suffix,
        icon: "/manifest.json",
        tag: "planner-reminders",
        renotify: true,
      });
    }

    // Also show in-app notification
    this.showNotification(`\uD83D\uDD14 ${due.length} reminder(s) due`, "info");
  }

  // ============================================
  //  EVENT LISTENERS & MODAL SETUP
  // ============================================

  // Set up event listeners
  setupEventListeners() {
    // Navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const view = e.currentTarget.dataset.view;
        this.switchView(view);
      });
    });

    // Quick add button
    document.getElementById("quickAddBtn").addEventListener("click", () => {
      this.openTaskModal();
    });

    // Settings button
    document.getElementById("settingsBtn").addEventListener("click", () => {
      this.openSettingsModal();
    });

    // Add list button
    document.getElementById("addListBtn").addEventListener("click", () => {
      this.openListModal();
    });

    // Week navigation
    document.getElementById("prevWeek").addEventListener("click", () => {
      this.navigateWeek(-1);
    });
    document.getElementById("nextWeek").addEventListener("click", () => {
      this.navigateWeek(1);
    });

    // Calendar month navigation
    document.getElementById("prevMonth").addEventListener("click", () => {
      this.navigateMonth(-1);
    });
    document.getElementById("nextMonth").addEventListener("click", () => {
      this.navigateMonth(1);
    });

    // Daily date picker
    const dailyPicker = document.getElementById("dailyDatePicker");
    if (dailyPicker) {
      dailyPicker.value = storage.getTodayDate();
      dailyPicker.addEventListener("change", () => {
        this.renderDailyView();
      });
    }

    // Task modal
    this.setupTaskModal();

    // Voice modal
    this.setupVoiceModal();

    // List modal
    this.setupListModal();

    // Close modals on outside click
    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
        }
      });
    });
  }

  // Setup task modal
  setupTaskModal() {
    const modal = document.getElementById("taskModal");
    const closeBtn = modal.querySelector(".close-btn");
    const cancelBtn = document.getElementById("cancelTaskBtn");
    const saveBtn = document.getElementById("saveTaskBtn");

    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    cancelBtn.addEventListener("click", () => modal.classList.remove("active"));

    saveBtn.addEventListener("click", () => {
      const title = document.getElementById("taskTitle").value.trim();
      const description = document
        .getElementById("taskDescription")
        .value.trim();
      const date = document.getElementById("taskDate").value;
      const list = document.getElementById("taskList").value;

      if (!title) {
        alert("Please enter a task title");
        return;
      }

      if (this.editingTaskId) {
        storage.updateTask(this.editingTaskId, {
          title,
          description,
          date,
          list,
        });
        this.editingTaskId = null;
      } else {
        storage.addTask({ title, description, date, list });
      }

      modal.classList.remove("active");
      this.refreshCurrentView();
      this.updateProgress();
    });
  }

  // Setup voice modal
  setupVoiceModal() {
    const modal = document.getElementById("voiceModal");
    const closeBtn = modal.querySelector(".close-btn");
    const cancelBtn = document.getElementById("cancelVoiceBtn");
    const startBtn = document.getElementById("startVoiceBtn");
    const processBtn = document.getElementById("processVoiceBtn");
    const indicator = document.getElementById("voiceIndicator");
    const status = document.getElementById("voiceStatus");
    const transcript = document.getElementById("voiceTranscript");

    closeBtn.addEventListener("click", () => {
      speech.stop();
      modal.classList.remove("active");
    });

    cancelBtn.addEventListener("click", () => {
      speech.stop();
      modal.classList.remove("active");
    });

    startBtn.addEventListener("click", () => {
      if (speech.isListening) {
        speech.stop();
        startBtn.innerHTML = '<span class="icon">🎤</span>';
        startBtn.classList.remove("listening");
        indicator.classList.remove("listening");
        status.textContent = "Click to start again";
      } else {
        speech.start();
        startBtn.innerHTML = '<span class="icon">⏹</span>';
        startBtn.classList.add("listening");
        indicator.classList.add("listening");
        status.textContent = "Listening... (Click to stop)";
      }
    });

    processBtn.addEventListener("click", async () => {
      const text = speech.getTranscript();
      if (!text || text.trim().length < 3) {
        alert("No tasks detected. Try again with clearer speech.");
        return;
      }

      await this.processVoiceUpdate(text.trim());
      speech.clearTranscript();
      modal.classList.remove("active");
    });
  }

  // Setup list modal
  setupListModal() {
    const modal = document.getElementById("listModal");
    const closeBtn = modal.querySelector(".close-btn");
    const cancelBtn = document.getElementById("cancelListBtn");
    const saveBtn = document.getElementById("saveListBtn");

    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
    cancelBtn.addEventListener("click", () => modal.classList.remove("active"));

    saveBtn.addEventListener("click", () => {
      const name = document.getElementById("listName").value.trim();
      const icon = document.getElementById("listIcon").value.trim() || "📋";

      if (!name) {
        alert("Please enter a section name");
        return;
      }

      storage.addList({ name, icon });
      modal.classList.remove("active");
      this.renderSidebar();

      // Clear inputs
      document.getElementById("listName").value = "";
      document.getElementById("listIcon").value = "";
    });
  }

  // ============================================
  //  SETTINGS
  // ============================================

  // Open settings modal
  openSettingsModal() {
    const modal = document.getElementById("settingsModal");
    const keyInput = document.getElementById("claudeApiKey");
    const voiceLocaleInput = document.getElementById("voiceLocale");
    keyInput.value = localStorage.getItem("anthropic_api_key") || "";
    voiceLocaleInput.value = localStorage.getItem("voice_locale") || "en-IN";
    const reminderIntervalInput = document.getElementById("reminderInterval");
    reminderIntervalInput.value =
      localStorage.getItem("reminder_interval") || "15";
    modal.classList.add("active");

    const closeBtn = modal.querySelector(".close-btn");
    const cancelBtn = document.getElementById("cancelSettingsBtn");
    const saveBtn = document.getElementById("saveSettingsBtn");

    const close = () => modal.classList.remove("active");
    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    saveBtn.onclick = () => {
      const key = keyInput.value.trim();
      const voiceLocale = voiceLocaleInput.value;
      const reminderInterval =
        document.getElementById("reminderInterval").value;
      if (typeof llm !== "undefined") {
        llm.setApiKey(key);
      }
      if (typeof speech !== "undefined") {
        speech.setLocale(voiceLocale);
      }
      localStorage.setItem("voice_locale", voiceLocale);
      localStorage.setItem("reminder_interval", reminderInterval);
      this.startReminders();
      modal.classList.remove("active");
      this.showNotification(
        key ? "✓ Settings saved" : "Settings saved",
        key ? "success" : "info",
      );
    };

    // Test API Key button
    const testBtn = document.getElementById("testApiKeyBtn");
    const statusSpan = document.getElementById("apiKeyStatus");
    if (testBtn) {
      testBtn.onclick = async () => {
        const key = keyInput.value.trim();
        if (!key) {
          statusSpan.textContent = "❌ No key entered";
          statusSpan.style.color = "#e74c3c";
          return;
        }
        statusSpan.textContent = "⏳ Testing...";
        statusSpan.style.color = "#888";
        if (typeof llm !== "undefined") {
          llm.setApiKey(key);
          const result = await llm.testApiKey();
          if (result.ok) {
            statusSpan.textContent = "✅ Connected!";
            statusSpan.style.color = "#27ae60";
          } else {
            statusSpan.textContent = `❌ ${result.error}`;
            statusSpan.style.color = "#e74c3c";
          }
        }
      };
    }
  }

  // ============================================
  // FLOATING VOICE FAB — Always-On Continuous Listening
  // ============================================
  setupVoiceFab() {
    const fab = document.getElementById("voiceFab");
    const overlay = document.getElementById("transcriptOverlay");
    const liveTranscript = document.getElementById("liveTranscript");
    const interimText = document.getElementById("interimText");
    const statusText = document.getElementById("transcriptStatusText");
    const closeBtn = document.getElementById("transcriptClose");
    this._isProcessing = false;

    // Click FAB to toggle continuous listening on/off
    fab.addEventListener("click", () => {
      if (speech.isContinuousMode) {
        speech.stopContinuousMode();
      } else {
        this._fabStartContinuous();
      }
    });

    // Close button on overlay — stop continuous listening
    closeBtn.addEventListener("click", () => {
      if (speech.isContinuousMode) {
        speech.stopContinuousMode();
      }
    });

    // Live transcript updates (shared by continuous & push-to-talk)
    speech.onResult = (result) => {
      const finalText = result.transcript.trim();
      if (finalText) {
        liveTranscript.innerHTML = this._highlightTranscript(finalText);
        overlay.className = "transcript-overlay";
        statusText.textContent = 'Transcribing... say "hola" to log';
      } else if (!this._isProcessing) {
        // Keep showing the waiting state if no transcript yet
        if (speech.isContinuousMode && speech.sessionActive) {
          liveTranscript.innerHTML =
            '<span class="placeholder-text">Listening... say "hola" when done</span>';
        }
      }

      if (result.interimTranscript) {
        interimText.textContent = result.interimTranscript;
        if (speech.isContinuousMode && speech.sessionActive) {
          overlay.className = "transcript-overlay";
          statusText.textContent = 'Transcribing... say "hola" to log';
        }
      } else {
        interimText.textContent = "";
      }
    };

    // Continuous mode: wake word detected — now transcribing
    speech.onContinuousWakeWord = () => {
      fab.className = "voice-fab listening";
      fab.querySelector(".fab-icon").textContent = "🎤";
      overlay.className = "transcript-overlay";
      statusText.textContent = 'Transcribing... say "hola" to log';
      liveTranscript.innerHTML =
        '<span class="placeholder-text">Listening... say "hola" when done</span>';
      interimText.textContent = "";
      voiceAssistant.playListeningSound();
    };

    // Continuous mode: utterance captured (user said stop word)
    speech.onContinuousUtterance = async (transcript) => {
      this._isProcessing = true;

      // Show processing state
      fab.className = "voice-fab processing";
      fab.querySelector(".fab-icon").textContent = "⏳";
      overlay.className = "transcript-overlay processing";
      statusText.textContent = "Processing...";
      interimText.textContent = "";
      liveTranscript.innerHTML = this._highlightTranscript(transcript);

      try {
        await this.processVoiceUpdate(transcript);

        // Brief success flash
        fab.className = "voice-fab done";
        fab.querySelector(".fab-icon").textContent = "✓";
        overlay.className = "transcript-overlay done";
        statusText.textContent = "Done!";
        voiceAssistant.playAcknowledgment();

        // Resume — back to waiting for wake word
        setTimeout(() => {
          this._isProcessing = false;
          if (speech.isContinuousMode) {
            speech._continuousResume();
            fab.className = "voice-fab listening";
            fab.querySelector(".fab-icon").textContent = "🎧";
            overlay.className = "transcript-overlay";
            statusText.textContent = 'Say "Hey Planner" to start...';
            liveTranscript.innerHTML =
              '<span class="placeholder-text">Waiting for wake word...</span>';
          }
        }, 1200);
      } catch (err) {
        console.error("Voice processing error:", err);
        this._isProcessing = false;
        this.showNotification(
          "Something went wrong. Still listening.",
          "warning",
        );
        if (speech.isContinuousMode) {
          speech._continuousResume();
          fab.className = "voice-fab listening";
          fab.querySelector(".fab-icon").textContent = "�";
          statusText.textContent = 'Say "Hey Planner" to start...';
        }
      }
    };

    // Continuous mode started (waiting for wake word)
    speech.onContinuousStart = () => {
      fab.className = "voice-fab listening";
      fab.querySelector(".fab-icon").textContent = "🎧";
      overlay.className = "transcript-overlay";
      overlay.classList.remove("hidden");
      statusText.textContent = 'Say "Hey Planner" to start...';
      liveTranscript.innerHTML =
        '<span class="placeholder-text">Waiting for wake word...</span>';
      interimText.textContent = "";
    };

    // Continuous mode stopped
    speech.onContinuousStop = () => {
      this._isProcessing = false;
      this._fabReset();
      this.showNotification("Listening stopped", "info");
    };

    // Continuous mode resumed after processing
    speech.onContinuousReady = () => {
      fab.className = "voice-fab listening";
      fab.querySelector(".fab-icon").textContent = "🎧";
      overlay.className = "transcript-overlay";
      statusText.textContent = 'Say "Hey Planner" to start...';
      liveTranscript.innerHTML =
        '<span class="placeholder-text">Waiting for wake word...</span>';
      interimText.textContent = "";
    };

    // Error handling
    speech.onError = (error) => {
      if (error === "not-allowed") {
        this._fabShowError(
          "Microphone access denied. Check browser permissions.",
        );
      } else {
        this.showNotification("Mic error — retrying...", "warning");
      }
    };
  }

  _fabStartContinuous() {
    const fab = document.getElementById("voiceFab");
    voiceAssistant.playListeningSound();
    speech.startContinuousMode();
    this.showNotification(
      'Always-on listening enabled. Say "Hey Planner" to start, "hola" to log!',
      "success",
    );
  }

  _fabSetState(state) {
    const fab = document.getElementById("voiceFab");
    const overlay = document.getElementById("transcriptOverlay");
    fab.className = `voice-fab ${state}`;
    overlay.className = `transcript-overlay ${state}`;

    if (state === "processing") {
      fab.querySelector(".fab-icon").textContent = "⏳";
    }
  }

  _fabShowSuccess() {
    const fab = document.getElementById("voiceFab");
    const overlay = document.getElementById("transcriptOverlay");
    const statusText = document.getElementById("transcriptStatusText");

    fab.className = "voice-fab done";
    fab.querySelector(".fab-icon").textContent = "✓";
    overlay.className = "transcript-overlay done";
    statusText.textContent = "Done!";

    voiceAssistant.playAcknowledgment();

    setTimeout(() => this._fabReset(), 1500);
  }

  _fabShowError(message) {
    const fab = document.getElementById("voiceFab");
    const overlay = document.getElementById("transcriptOverlay");
    const statusText = document.getElementById("transcriptStatusText");

    fab.className = "voice-fab error";
    fab.querySelector(".fab-icon").textContent = "✗";
    overlay.className = "transcript-overlay error";
    statusText.textContent = message;

    this.showNotification(message, "warning");

    setTimeout(() => this._fabReset(), 2500);
  }

  _fabReset() {
    const fab = document.getElementById("voiceFab");
    const overlay = document.getElementById("transcriptOverlay");

    fab.className = "voice-fab";
    fab.querySelector(".fab-icon").textContent = "🎤";
    overlay.classList.add("hidden");
  }

  _highlightTranscript(text) {
    // Simple cleanup for display
    return text.replace(/\s+/g, " ").trim();
  }

  // ============================================
  //  NAVIGATION & VIEW SWITCHING
  // ============================================

  // Switch view
  switchView(viewName) {
    // Update navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
    });
    document
      .querySelector(`[data-view="${viewName}"]`)
      ?.classList.add("active");

    // Update view
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.remove("active");
    });

    this.currentView = viewName;

    switch (viewName) {
      case "home":
        document.getElementById("homeView").classList.add("active");
        this.renderHomeView();
        break;
      case "calendar":
        document.getElementById("calendarView").classList.add("active");
        this.renderCalendarView();
        break;
      case "daily":
        document.getElementById("dailyView").classList.add("active");
        this.renderDailyView();
        break;
    }
  }

  // Switch to list view
  switchToListView(listId) {
    this.currentListId = listId;

    // Update navigation
    document.querySelectorAll(".nav-item, .list-item").forEach((item) => {
      item.classList.remove("active");
    });
    document
      .querySelector(`[data-list-id="${listId}"]`)
      ?.classList.add("active");

    // Show list view
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.remove("active");
    });
    document.getElementById("listView").classList.add("active");

    this.renderListView(listId);
  }

  // ============================================
  //  WAKE WORD MODE (Legacy)
  // ============================================

  // Toggle wake word mode
  toggleWakeWordMode() {
    if (speech.isWakeWordMode) {
      this.stopWakeWordMode();
    } else {
      this.startWakeWordMode();
    }
  }

  // Start wake word listening mode
  startWakeWordMode() {
    const button = document.getElementById("wakeWordToggle");
    const statusText = button.querySelector(".status-text");

    button.classList.remove("pulse");

    // Start wake word mode
    speech.startWakeWordMode();
    button.classList.add("active");
    statusText.textContent = "Say 'Hey Planner'";

    voiceAssistant.respondTo("listeningEnabled");
    this.showNotification(
      "Wake word mode enabled! Say 'Hey Planner' to start",
      "success",
    );

    // Set up wake word handlers
    speech.onWakeWordDetected = () => {
      button.classList.add("listening");
      statusText.textContent = "Listening...";

      // Just play a short beep — NO TTS voice (it interferes with mic!)
      voiceAssistant.playListeningSound();

      // Also show live transcript overlay
      const overlay = document.getElementById("transcriptOverlay");
      const transcriptStatusText = document.getElementById(
        "transcriptStatusText",
      );
      const liveTranscript = document.getElementById("liveTranscript");
      overlay.className = "transcript-overlay";
      transcriptStatusText.textContent = "Listening (wake word)...";
      liveTranscript.innerHTML =
        '<span class="placeholder-text">Speak now...</span>';
    };

    speech.onSessionEnd = async (transcript) => {
      const overlay = document.getElementById("transcriptOverlay");
      const transcriptStatusText = document.getElementById(
        "transcriptStatusText",
      );

      if (transcript && transcript.trim().length > 3) {
        transcriptStatusText.textContent = "Processing...";
        overlay.className = "transcript-overlay processing";
        try {
          await this.processVoiceUpdate(transcript);
          transcriptStatusText.textContent = "Done!";
          overlay.className = "transcript-overlay done";
          setTimeout(() => overlay.classList.add("hidden"), 1500);
        } catch (err) {
          transcriptStatusText.textContent = "Error processing";
          overlay.className = "transcript-overlay error";
          setTimeout(() => overlay.classList.add("hidden"), 2000);
        }
      } else {
        this.showNotification("Didn't catch that. Try again!", "warning");
        overlay.classList.add("hidden");
      }
      button.classList.remove("listening");
      button.classList.add("active");
      statusText.textContent = "Say 'Hey Planner'";
    };
  }

  // Stop wake word listening mode
  stopWakeWordMode() {
    const button = document.getElementById("wakeWordToggle");
    const statusText = button.querySelector(".status-text");

    speech.stopWakeWordMode();
    button.classList.remove("active", "listening");
    statusText.textContent = "Start Listening";

    voiceAssistant.respondTo("listeningDisabled");
    this.showNotification("Wake word mode disabled", "info");
  }

  // ============================================
  //  VOICE COMMAND PROCESSING
  // ============================================

  // Process voice update with smart task matching
  async processVoiceUpdate(transcript) {
    const allTasks = storage.getAllTasks();
    const today = storage.getTodayDate();

    // Try LLM (Claude) first for better parsing
    if (typeof llm !== "undefined" && llm.isConfigured()) {
      try {
        const llmResult = await llm.parseVoiceInput(transcript, allTasks);
        console.log("🧠 LLM parsed:", JSON.stringify(llmResult, null, 2));
        const items = llmResult?.items || llmResult?.tasks;
        if (items && items.length > 0) {
          for (const item of items) {
            console.log("🔍 Processing item:", item.type, item.title);
            // --- List creation ---
            if (item.type === "list") {
              storage.addList({ name: item.title || "New Section" });
              this.renderSidebar();
              this.showNotification(
                `📋 Created section: "${item.title}"`,
                "success",
              );
              continue;
            }

            // --- Reminder creation ---
            if (item.type === "reminder") {
              const remindAt = item.remindAt
                ? new Date(item.remindAt).toISOString()
                : null;
              storage.addTask({
                title: item.title,
                description: item.description || "",
                list: this.remindersListId,
                remindAt,
              });
              const timeLabel = item.remindAt
                ? ` at ${new Date(item.remindAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : "";
              this.showNotification(
                `🔔 Reminder added: "${item.title}"${timeLabel}`,
                "success",
              );
              this.renderSidebar();
              continue;
            }

            // Find matched task by ID or title
            let matched = null;
            if (item.matchedTaskId) {
              matched = allTasks.find((t) => t.id === item.matchedTaskId);
            }
            if (!matched && item.matchedTask) {
              matched = allTasks.find((t) => t.title === item.matchedTask);
              if (!matched) {
                // Fuzzy: find best substring match
                const needle = item.matchedTask.toLowerCase();
                matched = allTasks.find(
                  (t) =>
                    t.title.toLowerCase().includes(needle) ||
                    needle.includes(t.title.toLowerCase()),
                );
              }
            }

            // --- Delete ---
            if (item.action === "delete") {
              if (matched) {
                storage.deleteTask(matched.id);
                this.showNotification(
                  `🗑️ Deleted: "${matched.title}"`,
                  "success",
                );
              } else {
                this.showNotification(
                  `❌ Couldn't find task to delete: "${item.matchedTask || item.title}"`,
                  "warning",
                );
              }
              continue;
            }

            // --- Complete ---
            if (item.action === "complete") {
              if (matched) {
                storage.updateTask(matched.id, { completed: true });
                this.showNotification(
                  `✓ Completed: "${matched.title}"`,
                  "success",
                );
              } else {
                // No matching task — create it as completed
                const taskDate = item.date || today;
                storage.addTask({
                  title: item.title,
                  description: item.description || "",
                  date: taskDate,
                  completed: true,
                });
                this.showNotification(
                  `➕ Created & completed: "${item.title}"`,
                  "success",
                );
              }
              continue;
            }

            // --- Move (change date) ---
            if (item.action === "move" && matched && item.date) {
              storage.updateTask(matched.id, { date: item.date });
              this.showNotification(
                `📅 Moved "${matched.title}" to ${item.date}`,
                "success",
              );
              continue;
            }

            // --- Update existing task ---
            if (item.action === "update") {
              if (matched) {
                const updates = {};
                const updateParts = [];
                if (item.description) updateParts.push(item.description);
                if (item.title && item.title !== matched.title)
                  updateParts.push(item.title);
                if (updateParts.length > 0) {
                  updates.description = this.appendDatedDescriptionEntry(
                    matched.description,
                    updateParts.join(" | "),
                  );
                }
                if (item.date) updates.date = item.date;
                if (item.listName) {
                  const list = storage
                    .getAllLists()
                    .find(
                      (l) =>
                        l.name.toLowerCase() === item.listName.toLowerCase(),
                    );
                  if (list) updates.list = list.id;
                }
                storage.updateTask(matched.id, updates);
                this.showNotification(
                  `📝 Updated: "${matched.title}"`,
                  "success",
                );
              } else {
                // No matching task — create it with the description as an update note
                const taskDate = item.date || today;
                const desc = item.description
                  ? this.appendDatedDescriptionEntry("", item.description)
                  : "";
                storage.addTask({
                  title: item.title,
                  description: desc,
                  date: taskDate,
                  completed: false,
                });
                this.showNotification(`➕ Created: "${item.title}"`, "success");
              }
              continue;
            }

            // --- Create new task ---
            const taskDate = item.date || today;
            let listId = null;
            if (item.listName) {
              const list = storage
                .getAllLists()
                .find(
                  (l) => l.name.toLowerCase() === item.listName.toLowerCase(),
                );
              listId = list ? list.id : null;
            }
            storage.addTask({
              title: item.title,
              description: item.description || "",
              date: taskDate,
              completed: item.isCompleted || false,
              list: listId,
            });
            const dateLabel = taskDate === today ? "" : ` (${taskDate})`;
            this.showNotification(
              `➕ Created: "${item.title}"${dateLabel}`,
              "success",
            );
          }
          this.refreshCurrentView();
          this.updateProgress();
          return;
        }
      } catch (err) {
        console.warn("LLM fallback to local AI:", err);
        this.showNotification(
          `⚠️ Claude failed: ${err.message || err}. Using local parser.`,
          "warning",
        );
      }
    }

    // Fallback: local AI Brain
    const normalized = transcript.toLowerCase().trim();

    // Handle "remind me to X" locally
    const remindMatch = normalized.match(
      /(?:remind\s+me\s+to|reminder\s+to|set\s+(?:a\s+)?reminder\s+(?:to|for)|don'?t\s+forget\s+to)\s+(.+)/i,
    );
    if (remindMatch) {
      const title = remindMatch[1].replace(/[.!?]+$/, "").trim();
      if (title) {
        storage.addTask({
          title: title.charAt(0).toUpperCase() + title.slice(1),
          list: this.remindersListId,
          remindAt: null,
        });
        this.renderSidebar();
        this.showNotification(`🔔 Reminder added: "${title}"`, "success");
        this.refreshCurrentView();
        return;
      }
    }

    // Handle "add new list" / "create list" / "add X to my lists" voice commands locally
    const listMatch = normalized.match(
      /(?:add|create|make)\s+(?:a\s+)?(?:new\s+)?list\s+(?:called\s+|named\s+)?(.+)/i,
    );
    const listMatch2 = normalized.match(
      /(?:add|create|make)\s+(.+?)\s+(?:to\s+(?:my\s+)?lists?|lists?|to\s+lists?)$/i,
    );
    const listName =
      (listMatch && listMatch[1]) || (listMatch2 && listMatch2[1]);
    if (listName) {
      const cleanName = listName.replace(/[.!?]+$/, "").trim();
      if (cleanName) {
        storage.addList({
          name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        });
        this.renderSidebar();
        this.showNotification(`📋 Created section: "${cleanName}"`, "success");
        this.refreshCurrentView();
        return;
      }
    }

    // Handle "delete/remove task X" locally
    const deleteMatch = normalized.match(
      /(?:delete|remove|cancel)\s+(?:task\s+|the\s+)?(.+)/i,
    );
    if (deleteMatch) {
      const target = deleteMatch[1].trim();
      const matched = allTasks.find(
        (t) =>
          t.title.toLowerCase().includes(target) ||
          target.includes(t.title.toLowerCase()),
      );
      if (matched) {
        storage.deleteTask(matched.id);
        this.showNotification(`🗑️ Deleted: "${matched.title}"`, "success");
        this.refreshCurrentView();
        this.updateProgress();
        return;
      }
    }

    // Handle "complete/finish/done X" locally
    const completeMatch = normalized.match(
      /(?:complete|finish|mark\s+done|done\s+with|i\s+finished)\s+(?:task\s+|the\s+)?(.+)/i,
    );
    if (completeMatch) {
      const target = completeMatch[1].trim();
      const matched = allTasks.find(
        (t) =>
          t.title.toLowerCase().includes(target) ||
          target.includes(t.title.toLowerCase()),
      );
      if (matched) {
        storage.updateTask(matched.id, { completed: true });
        this.showNotification(`✓ Completed: "${matched.title}"`, "success");
        this.refreshCurrentView();
        this.updateProgress();
        return;
      }
    }

    // Resolve relative dates for "add X for tomorrow/yesterday"
    const dateMatch = normalized.match(
      /(?:add|create)\s+(.+?)\s+(?:for|on)\s+(yesterday|today|tomorrow)/i,
    );
    if (dateMatch) {
      const title = aiBrain.generateTaskTitle(dateMatch[1]);
      const d = new Date();
      if (dateMatch[2] === "yesterday") d.setDate(d.getDate() - 1);
      else if (dateMatch[2] === "tomorrow") d.setDate(d.getDate() + 1);
      const dateStr = storage.formatLocalDate(d);
      storage.addTask({
        title,
        description: "",
        date: dateStr,
        completed: false,
      });
      this.showNotification(
        `➕ Created: "${title}" (${dateMatch[2]})`,
        "success",
      );
      this.refreshCurrentView();
      this.updateProgress();
      return;
    }

    // Split on "and" / "also" / commas for multiple tasks
    const parts = transcript
      .split(/\s*(?:,|\band\b|\balso\b|\bthen\b)\s*/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 2);

    if (parts.length > 1) {
      for (const part of parts) {
        const title = aiBrain.generateTaskTitle(part);
        storage.addTask({
          title,
          description: part,
          date: today,
          completed: false,
        });
        this.showNotification(`➕ Created: "${title}"`, "success");
      }
      this.refreshCurrentView();
      this.updateProgress();
      return;
    }

    const aiResult = aiBrain.processVoiceInput(transcript, allTasks);

    // Show what was corrected if there are differences
    if (aiResult.original !== aiResult.corrected) {
      this.showNotification(`✏️ Corrected: "${aiResult.corrected}"`, "info");
    }

    // Use corrected text for processing
    const processedText = aiResult.corrected;

    // AI-powered intent understanding
    const intent = aiResult.intent;
    const analysis = aiResult.analysis;

    // Show context if available
    if (aiResult.context.hasContext) {
      console.log("Context found:", aiResult.context.suggestion);
    }

    // Try to match with existing tasks
    const matchedTask = speech.matchExistingTasks(processedText, allTasks);

    if (matchedTask) {
      // Update existing task based on AI intent
      if (intent.action === "complete" || analysis.sentiment === "positive") {
        // Mark as completed
        storage.updateTask(matchedTask.id, {
          completed: true,
          description:
            matchedTask.description +
            `\n\n✓ ${new Date().toLocaleString()}: ${processedText}`,
          updatedAt: new Date().toISOString(),
        });
        this.showNotification(
          `✓ Marked "${matchedTask.title}" as completed!`,
          "success",
        );
      } else {
        // Update description/progress
        const updatedDesc = this.appendDatedDescriptionEntry(
          matchedTask.description,
          processedText,
        );

        storage.updateTask(matchedTask.id, {
          description: updatedDesc,
          updatedAt: new Date().toISOString(),
        });
        this.showNotification(`📝 Updated "${matchedTask.title}"`, "success");
      }
    } else {
      // Create new tasks using AI-generated title
      if (intent.confidence > 0.5) {
        const taskTitle = aiResult.taskTitle;
        const isCompleted =
          intent.action === "log" || analysis.sentiment === "positive";

        storage.addTask({
          title: taskTitle,
          description: "",
          date: today,
          completed: isCompleted,
        });

        this.showNotification(
          `${isCompleted ? "✓" : "➕"} ${isCompleted ? "Logged" : "Created"}: "${taskTitle}"`,
          "success",
        );
      } else {
        // Low confidence — just create a task with the raw transcript as title
        const cleanTitle = transcript
          .replace(/^\s*(add|create|make|new)\s+/i, "")
          .replace(/[.!?]+$/, "")
          .trim();
        if (cleanTitle.length > 2) {
          storage.addTask({
            title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
            description: "",
            date: today,
            completed: false,
          });
          this.showNotification(`➕ Created: "${cleanTitle}"`, "success");
        } else {
          this.showNotification(
            "🤔 I didn't quite understand. Try being more specific!",
            "warning",
          );
        }
      }
    }

    this.refreshCurrentView();
    this.updateProgress();
  }

  // Extract update information from transcript
  extractUpdateInfo(transcript) {
    const normalized = transcript.toLowerCase();
    const completionWords = ["completed", "finished", "done", "completed"];
    const isCompleting = completionWords.some((word) =>
      normalized.includes(word),
    );

    return { isCompleting };
  }

  // ============================================
  //  UI NOTIFICATIONS
  // ============================================

  // Show notification
  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to body
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add("show"), 10);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ============================================
  //  RENDERING — Header, Sidebar, Dropdowns
  // ============================================

  // Render header
  renderHeader() {
    const dateDisplay = document.getElementById("currentDate");
    const today = new Date();
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    dateDisplay.textContent = today.toLocaleDateString("en-US", options);
  }

  // Render sidebar
  renderSidebar() {
    const listsContainer = document.getElementById("customLists");
    const remindersContainer = document.getElementById("remindersList");
    const lists = storage.getAllLists();

    // Separate reminders from regular sections
    const sections = lists.filter((l) => l.id !== this.remindersListId);
    const remindersList = lists.filter((l) => l.id === this.remindersListId);

    listsContainer.innerHTML = "";
    remindersContainer.innerHTML = "";

    const renderListItem = (list, container) => {
      const listTasks = storage.getTasksByList(list.id);
      const taskCount = listTasks.length;
      const allDone = taskCount > 0 && listTasks.every((t) => t.completed);
      const listItem = document.createElement("button");
      listItem.className = "list-item" + (allDone ? " list-done" : "");
      listItem.dataset.listId = list.id;
      listItem.innerHTML = `
                <div class="list-item-content">
                    <span class="icon">${list.icon}</span>
                    <span>${list.name}</span>
                </div>
                <span class="list-item-count">${taskCount}</span>
            `;
      listItem.addEventListener("click", () => {
        this.switchToListView(list.id);
      });
      container.appendChild(listItem);
    };

    sections.forEach((list) => renderListItem(list, listsContainer));
    remindersList.forEach((list) => renderListItem(list, remindersContainer));

    // Update task list dropdown in modal
    this.updateTaskListDropdown();
  }

  // Update task list dropdown
  updateTaskListDropdown() {
    const select = document.getElementById("taskList");
    const lists = storage.getAllLists();

    select.innerHTML = '<option value="">Select a section (optional)</option>';
    lists.forEach((list) => {
      const option = document.createElement("option");
      option.value = list.id;
      option.textContent = `${list.icon} ${list.name}`;
      select.appendChild(option);
    });
  }

  // ============================================
  //  RENDERING — Views (Home, Calendar, Daily)
  // ============================================

  // Render home view (week view + list sections)
  renderHomeView() {
    const weekContainer = document.getElementById("weekContainer");
    const weekRange = document.getElementById("weekRange");

    // Update week range display
    const endDate = new Date(this.currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    weekRange.textContent = `${this.formatDateShort(this.currentWeekStart)} - ${this.formatDateShort(endDate)}`;

    // Generate days
    weekContainer.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart);
      date.setDate(date.getDate() + i);
      const dateStr = storage.formatLocalDate(date);

      const dayCard = this.createDayCard(date, dateStr);
      weekContainer.appendChild(dayCard);
    }
  }

  // Render lists as sections on home view
  renderListSections() {
    const container = document.getElementById("listSections");
    if (!container) return;

    const lists = storage.getAllLists();
    if (lists.length === 0) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = lists
      .map((list) => {
        const tasks = storage.getTasksByList(list.id);
        const completed = tasks.filter((t) => t.completed).length;
        return `
          <div class="list-section" data-list-id="${list.id}">
            <div class="list-section-header">
              <h3>
                <span>${list.icon}</span>
                <span>${this.escapeHtml(list.name)}</span>
                <span class="list-section-count">${completed}/${tasks.length}</span>
              </h3>
              <button class="list-section-add" data-list-id="${list.id}" title="Add task to ${this.escapeHtml(list.name)} section">+</button>
            </div>
            <div class="task-list">
              ${tasks.length > 0 ? this.renderTaskItems(tasks) : '<div class="list-section-empty">No tasks yet</div>'}
            </div>
          </div>
        `;
      })
      .join("");

    // Wire up add buttons
    container.querySelectorAll(".list-section-add").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openTaskModal(null, btn.dataset.listId);
      });
    });
  }

  // Create day card
  createDayCard(date, dateStr) {
    const dayCard = document.createElement("div");
    dayCard.className = "day-card";

    const today = storage.getTodayDate();
    if (dateStr === today) {
      dayCard.classList.add("today");
    }

    const tasks = storage.getTasksByDate(dateStr);
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
    const dayDate = date.getDate();

    dayCard.innerHTML = `
            <div class="day-header">
                <div>
                    <div class="day-name">${dayName}</div>
                    <div class="day-date">${dayDate}</div>
                </div>
                <button class="add-task-btn" data-date="${dateStr}">+</button>
            </div>
            <div class="task-list" data-date="${dateStr}">
                ${this.renderTaskItems(tasks)}
            </div>
        `;

    // Add task button listener
    dayCard.querySelector(".add-task-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.openTaskModal(dateStr);
    });

    return dayCard;
  }

  // Render task items
  renderTaskItems(tasks) {
    if (tasks.length === 0) {
      return '<div style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 1rem;">No tasks</div>';
    }

    return tasks
      .map(
        (task) => `
            <div class="task-item ${task.completed ? "completed" : ""}" data-task-id="${task.id}">
                <input type="checkbox" class="task-checkbox" ${task.completed ? "checked" : ""} 
                    onchange="app.toggleTask('${task.id}')">
                <div class="task-content" onclick="app.editTask('${task.id}')">
                    <div class="task-title">${this.escapeHtml(task.title)}</div>
                    ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ""}
                </div>
                <button class="task-delete" onclick="app.deleteTask('${task.id}')">✕</button>
            </div>
        `,
      )
      .join("");
  }

  // Render calendar view
  renderCalendarView() {
    const container = document.getElementById("calendarContainer");
    const monthYearLabel = document.getElementById("calendarMonthYear");
    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();
    const today = storage.getTodayDate();

    monthYearLabel.textContent = new Date(year, month).toLocaleDateString(
      "en-US",
      {
        month: "long",
        year: "numeric",
      },
    );

    // First day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Adjust so Monday = 0
    const startOffset = (firstDay + 6) % 7;

    // Day headers
    const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      .map((d) => `<div class="cal-header-cell">${d}</div>`)
      .join("");

    // Build day cells
    let cells = "";
    // Empty cells before first day
    for (let i = 0; i < startOffset; i++) {
      cells += '<div class="cal-cell cal-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const tasks = storage.getTasksByDate(dateStr);
      const isToday = dateStr === today;
      const completed = tasks.filter((t) => t.completed).length;

      cells += `
        <div class="cal-cell ${isToday ? "cal-today" : ""}" data-date="${dateStr}">
          <div class="cal-day-number">${day}</div>
          ${
            tasks.length > 0
              ? `<div class="cal-tasks">
                ${tasks
                  .slice(0, 3)
                  .map(
                    (t) =>
                      `<div class="cal-task-dot ${t.completed ? "done" : ""}" title="${this.escapeHtml(t.title)}">${this.escapeHtml(t.title)}</div>`,
                  )
                  .join("")}
                ${tasks.length > 3 ? `<div class="cal-more">+${tasks.length - 3} more</div>` : ""}
              </div>`
              : ""
          }
          ${tasks.length > 0 ? `<div class="cal-badge">${completed}/${tasks.length}</div>` : ""}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="cal-grid">
        ${dayHeaders}
        ${cells}
      </div>
    `;

    // Click on day to open task modal for that date
    container.querySelectorAll(".cal-cell:not(.cal-empty)").forEach((cell) => {
      cell.addEventListener("click", () => {
        this.openTaskModal(cell.dataset.date);
      });
    });
  }

  // Navigate calendar months
  navigateMonth(direction) {
    this.currentCalendarDate.setMonth(
      this.currentCalendarDate.getMonth() + direction,
    );
    this.renderCalendarView();
  }

  // Render daily view
  renderDailyView() {
    const container = document.getElementById("dailyContainer");
    const datePicker = document.getElementById("dailyDatePicker");
    const selectedDate = datePicker.value;

    const tasks = storage.getTasksByDate(selectedDate);
    const stats = storage.getStats(selectedDate, selectedDate);

    container.innerHTML = `
            <div class="daily-stats">
                <h3>${storage.formatDate(selectedDate)}</h3>
                <p>Completed: ${stats.completed} / ${stats.total} (${stats.completionRate}%)</p>
            </div>
            <div class="task-list">
                ${this.renderTaskItems(tasks)}
            </div>
            <button class="btn-primary" onclick="app.openTaskModal('${selectedDate}')" style="margin-top: 1rem;">
                Add Task
            </button>
            <button class="btn-secondary" onclick="app.downloadDayMarkdown('${selectedDate}')" style="margin-top: 1rem; margin-left: 1rem;">
                Export to Markdown
            </button>
        `;
  }

  // ============================================
  //  RENDERING — List / Kanban View
  // ============================================

  // Render list view
  renderListView(listId) {
    // If this is the Reminders section, render the reminder-specific view
    if (listId === this.remindersListId) {
      this.renderRemindersView(listId);
      return;
    }

    const container = document.getElementById("listContainer");
    const titleElem = document.getElementById("listViewTitle");
    const deleteBtn = document.getElementById("deleteListBtn");

    // Restore section buttons (hidden by reminders view)
    deleteBtn.style.display = "";
    document.getElementById("editListBtn").style.display = "";
    document.getElementById("markListDoneBtn").style.display = "";
    document.getElementById("pasteTasksBtn").style.display = "";

    const list = storage.getAllLists().find((l) => l.id === listId);
    if (!list) return;

    titleElem.textContent = `${list.icon} ${list.name}`;

    const tasks = storage.getTasksByList(listId);

    // Derive status for backward compat
    const getStatus = (t) => {
      if (t.status && t.status !== "todo") return t.status;
      if (t.completed) return "completed";
      return t.status || "todo";
    };

    const columns = [
      { key: "todo", label: "To Do", icon: "\ud83d\udccb", color: "#4a90e2" },
      {
        key: "in-progress",
        label: "In Progress",
        icon: "\ud83d\udd04",
        color: "#f5a623",
      },
      {
        key: "blocked",
        label: "Blocked",
        icon: "\ud83d\udeab",
        color: "#e74c3c",
      },
      {
        key: "completed",
        label: "Completed",
        icon: "\u2705",
        color: "#27ae60",
      },
    ];

    const grouped = {};
    columns.forEach((c) => (grouped[c.key] = []));
    tasks.forEach((t) => {
      const s = getStatus(t);
      if (grouped[s]) grouped[s].push(t);
      else grouped["todo"].push(t);
    });

    container.innerHTML = `
      <div class="kanban-board">
        ${columns
          .map(
            (col) => `
          <div class="kanban-column" data-status="${col.key}">
            <div class="kanban-column-header" style="border-bottom-color: ${col.color}">
              <span>${col.icon} ${col.label}</span>
              <span class="kanban-count">${grouped[col.key].length}</span>
            </div>
            <div class="kanban-cards" data-status="${col.key}">
              ${grouped[col.key]
                .map(
                  (task) => `
                <div class="kanban-card" data-task-id="${task.id}" draggable="true">
                  <div class="kanban-card-title">${this.escapeHtml(task.title)}</div>
                  ${task.description ? `<div class="kanban-card-desc">${this.escapeHtml(task.description)}</div>` : ""}
                  <div class="kanban-card-actions">
                    <button class="task-delete" onclick="app.deleteTask('${task.id}')">\u2715</button>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
            ${col.key === "todo" ? `<button class="kanban-add-btn" onclick="app.openTaskModal(null, '${listId}')">+ Add Task</button>` : ""}
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // Wire up drag and drop
    this.setupKanbanDragDrop(listId);

    // Wire up card click to edit
    container.querySelectorAll(".kanban-card-title").forEach((el) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        this.editTask(el.closest(".kanban-card").dataset.taskId);
      });
    });

    deleteBtn.onclick = () => {
      if (confirm(`Delete section "${list.name}" and all its tasks?`)) {
        storage.deleteList(listId);
        this.switchView("home");
        this.renderSidebar();
      }
    };

    const editBtn = document.getElementById("editListBtn");
    editBtn.onclick = () => {
      const newName = prompt("Rename section:", list.name);
      if (newName && newName.trim() && newName.trim() !== list.name) {
        storage.updateList(listId, { name: newName.trim() });
        this.renderSidebar();
        this.renderListView(listId);
      }
    };

    const markDoneBtn = document.getElementById("markListDoneBtn");
    markDoneBtn.onclick = () => {
      const pendingTasks = tasks.filter((t) => !t.completed);
      if (pendingTasks.length === 0) {
        this.showNotification("All tasks already completed", "info");
        return;
      }
      if (confirm(`Mark all ${pendingTasks.length} pending task(s) as done?`)) {
        pendingTasks.forEach((t) => {
          storage.updateTask(t.id, { status: "completed", completed: true });
        });
        this.renderListView(listId);
        this.updateProgress();
        this.showNotification(
          `✅ Marked ${pendingTasks.length} task(s) as done`,
          "success",
        );
      }
    };

    const pasteBtn = document.getElementById("pasteTasksBtn");
    pasteBtn.onclick = () => {
      this.openPasteModal(listId);
    };
  }

  // ============================================
  //  RENDERING — Reminders View
  // ============================================

  renderRemindersView(listId) {
    const container = document.getElementById("listContainer");
    const titleElem = document.getElementById("listViewTitle");
    const deleteBtn = document.getElementById("deleteListBtn");
    const editBtn = document.getElementById("editListBtn");
    const markDoneBtn = document.getElementById("markListDoneBtn");
    const pasteBtn = document.getElementById("pasteTasksBtn");

    titleElem.textContent = "🔔 Reminders";

    // Hide section-specific buttons not relevant to reminders
    deleteBtn.style.display = "none";
    editBtn.style.display = "none";
    markDoneBtn.style.display = "none";
    pasteBtn.style.display = "none";

    const tasks = storage.getTasksByList(listId);
    const now = new Date();

    // Sort: pending first (soonest remindAt first), then completed
    const sorted = [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const aTime = a.remindAt ? new Date(a.remindAt).getTime() : 0;
      const bTime = b.remindAt ? new Date(b.remindAt).getTime() : 0;
      return aTime - bTime;
    });

    container.innerHTML = `
      <div class="reminders-list">
        <button class="btn-primary" onclick="app.openReminderModal()" style="margin-bottom: 1rem;">
          + Add Reminder
        </button>
        ${sorted.length === 0 ? '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">No reminders yet. Add one!</div>' : ""}
        ${sorted
          .map((task) => {
            const isDue =
              !task.completed &&
              task.remindAt &&
              new Date(task.remindAt) <= now;
            const remindLabel = task.remindAt
              ? new Date(task.remindAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No time set";
            return `
              <div class="reminder-item ${task.completed ? "completed" : ""} ${isDue ? "due" : ""}" data-task-id="${task.id}">
                <input type="checkbox" class="task-checkbox" ${task.completed ? "checked" : ""}
                  onchange="app.toggleReminder('${task.id}')">
                <div class="reminder-content" onclick="app.editReminder('${task.id}')">
                  <div class="reminder-title">${this.escapeHtml(task.title)}</div>
                  ${task.description ? `<div class="reminder-desc">${this.escapeHtml(task.description)}</div>` : ""}
                  <div class="reminder-time ${isDue ? "overdue" : ""}">
                    🕐 ${remindLabel}
                  </div>
                </div>
                <button class="task-delete" onclick="app.deleteTask('${task.id}')">✕</button>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  // Open reminder modal (add new)
  openReminderModal(taskId = null) {
    const modal = document.getElementById("reminderModal");
    const titleInput = document.getElementById("reminderTitle");
    const descInput = document.getElementById("reminderDescription");
    const dateTimeInput = document.getElementById("reminderDateTime");
    const saveBtn = document.getElementById("saveReminderBtn");
    const cancelBtn = document.getElementById("cancelReminderBtn");
    const closeBtn = modal.querySelector(".close-btn");
    const modalTitle = document.getElementById("reminderModalTitle");

    this._editingReminderId = null;

    if (taskId) {
      // Edit existing reminder
      const task = storage.getAllTasks().find((t) => t.id === taskId);
      if (!task) return;
      this._editingReminderId = taskId;
      modalTitle.textContent = "Edit Reminder";
      titleInput.value = task.title;
      descInput.value = task.description || "";
      dateTimeInput.value = task.remindAt ? task.remindAt.slice(0, 16) : "";
    } else {
      modalTitle.textContent = "Add Reminder";
      titleInput.value = "";
      descInput.value = "";
      // Default to 1 hour from now
      const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
      const local = new Date(
        defaultTime.getTime() - defaultTime.getTimezoneOffset() * 60000,
      );
      dateTimeInput.value = local.toISOString().slice(0, 16);
    }

    modal.classList.add("active");
    titleInput.focus();

    const close = () => modal.classList.remove("active");
    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    saveBtn.onclick = () => {
      const title = titleInput.value.trim();
      if (!title) {
        alert("Please enter a reminder title");
        return;
      }
      const remindAt = dateTimeInput.value
        ? new Date(dateTimeInput.value).toISOString()
        : null;

      if (this._editingReminderId) {
        storage.updateTask(this._editingReminderId, {
          title,
          description: descInput.value.trim(),
          remindAt,
        });
      } else {
        storage.addTask({
          title,
          description: descInput.value.trim(),
          list: this.remindersListId,
          remindAt,
        });
      }

      modal.classList.remove("active");
      this.renderListView(this.remindersListId);
      this.renderSidebar();
      this.showNotification(
        this._editingReminderId ? "📝 Reminder updated" : "🔔 Reminder added",
        "success",
      );
    };
  }

  // Edit reminder
  editReminder(taskId) {
    this.openReminderModal(taskId);
  }

  // Toggle reminder completion
  toggleReminder(taskId) {
    const task = storage.getAllTasks().find((t) => t.id === taskId);
    if (task) {
      storage.updateTask(taskId, { completed: !task.completed });
      this.renderListView(this.remindersListId);
      this.renderSidebar();
    }
  }

  // Move task to a new status column
  moveTaskStatus(taskId, newStatus, listId) {
    const isCompleted = newStatus === "completed";
    storage.updateTask(taskId, { status: newStatus, completed: isCompleted });
    if (listId) {
      this.renderListView(listId);
    }
    this.refreshCurrentView();
    this.updateProgress();
  }

  appendDatedDescriptionEntry(existingDescription, note) {
    const cleanNote = (note || "").trim();
    if (!cleanNote) {
      return existingDescription || "";
    }

    const entryDate = storage.getTodayDate();
    const bulletEntry = `- ${entryDate}: ${cleanNote}`;

    return existingDescription
      ? `${existingDescription}\n${bulletEntry}`
      : bulletEntry;
  }

  // Setup drag and drop for Kanban
  setupKanbanDragDrop(listId) {
    const cards = document.querySelectorAll(".kanban-card");
    const dropZones = document.querySelectorAll(".kanban-cards");

    cards.forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.dataset.taskId);
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
      });
    });

    dropZones.forEach((zone) => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const taskId = e.dataTransfer.getData("text/plain");
        const newStatus = zone.dataset.status;
        this.moveTaskStatus(taskId, newStatus, listId);
      });
    });
  }

  // ============================================
  //  TASK CRUD & MODALS
  // ============================================

  // Open paste tasks modal for a section
  openPasteModal(listId) {
    const modal = document.getElementById("pasteModal");
    const input = document.getElementById("pasteTasksInput");
    const importBtn = document.getElementById("importPasteBtn");
    const cancelBtn = modal.querySelector("#cancelPasteBtn");
    const closeBtn = modal.querySelector(".close-btn");

    input.value = "";
    modal.classList.add("active");
    input.focus();

    const close = () => modal.classList.remove("active");
    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    importBtn.onclick = () => {
      const text = input.value.trim();
      if (!text) return;

      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[\s\-\*\d\.\)\]]+/, "").trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) return;

      for (const line of lines) {
        storage.addTask({
          title: line,
          list: listId,
        });
      }

      modal.classList.remove("active");
      this.renderListView(listId);
      this.renderSidebar();
      this.updateProgress();
      this.showNotification(
        `✅ Imported ${lines.length} task${lines.length !== 1 ? "s" : ""}`,
        "success",
      );
    };
  }

  // Navigate week
  navigateWeek(direction) {
    const newDate = new Date(this.currentWeekStart);
    newDate.setDate(newDate.getDate() + direction * 7);
    this.currentWeekStart = newDate;
    this.renderHomeView();
  }

  // Open task modal
  openTaskModal(date = null, listId = null) {
    const modal = document.getElementById("taskModal");
    this.editingTaskId = null;

    document.getElementById("modalTitle").textContent = "Add Task";
    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDescription").value = "";
    document.getElementById("taskDate").value = date || storage.getTodayDate();
    document.getElementById("taskList").value = listId || "";

    modal.classList.add("active");
    document.getElementById("taskTitle").focus();
  }

  // Open voice modal
  openVoiceModal() {
    const modal = document.getElementById("voiceModal");
    document.getElementById("voiceTranscript").textContent = "";
    document.getElementById("processVoiceBtn").disabled = true;
    document.getElementById("voiceStatus").textContent =
      "Click the microphone to start";
    speech.clearTranscript();
    modal.classList.add("active");
  }

  // Open list modal
  openListModal() {
    // Free tier: max 3 custom lists (excluding built-in Reminders)
    const userLists = storage.getAllLists().filter(
      l => !(l.name === "Reminders" && l.icon === "🔔")
    );
    const limit = typeof CONFIG !== "undefined" ? CONFIG.freeListLimit : 3;
    if (!auth.isPro() && userLists.length >= limit) {
      this.showUpgradeModal();
      return;
    }
    const modal = document.getElementById("listModal");
    modal.classList.add("active");
    document.getElementById("listName").focus();
  }

  // Toggle task completion
  toggleTask(taskId) {
    const task = storage.getAllTasks().find((t) => t.id === taskId);
    if (task) {
      const nowCompleted = !task.completed;
      storage.updateTask(taskId, {
        completed: nowCompleted,
        status: nowCompleted ? "completed" : "todo",
      });
      this.refreshCurrentView();
      this.updateProgress();
    }
  }

  // Edit task
  editTask(taskId) {
    const task = storage.getAllTasks().find((t) => t.id === taskId);
    if (!task) return;

    this.editingTaskId = taskId;
    const modal = document.getElementById("taskModal");

    document.getElementById("modalTitle").textContent = "Edit Task";
    document.getElementById("taskTitle").value = task.title;
    document.getElementById("taskDescription").value = task.description || "";
    document.getElementById("taskDate").value = task.date;
    document.getElementById("taskList").value = task.list || "";

    modal.classList.add("active");
    document.getElementById("taskTitle").focus();
  }

  // Delete task
  deleteTask(taskId) {
    if (confirm("Delete this task?")) {
      storage.deleteTask(taskId);
      this.refreshCurrentView();
      this.updateProgress();
    }
  }

  // Download day markdown
  downloadDayMarkdown(date) {
    storage.downloadMarkdown(date);
  }

  // ============================================
  //  PROGRESS & VIEW REFRESH
  // ============================================

  // Update progress
  updateProgress() {
    const today = storage.getTodayDate();
    const stats = storage.getStats(today, today);

    document.getElementById("progressFill").style.width =
      `${stats.completionRate}%`;
    document.getElementById("completedCount").textContent = stats.completed;
    document.getElementById("totalCount").textContent = stats.total;
    document.getElementById("progressPercent").textContent =
      `${stats.completionRate}%`;
  }

  // Refresh current view
  refreshCurrentView() {
    switch (this.currentView) {
      case "home":
        this.renderHomeView();
        break;
      case "daily":
        this.renderDailyView();
        break;
      case "calendar":
        this.renderCalendarView();
        break;
    }

    if (this.currentListId) {
      this.renderListView(this.currentListId);
    }

    this.renderSidebar();
  }

  // ============================================
  //  HELPERS
  // ============================================

  // Helper: Get week start (Monday)
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  // Helper: Format date short
  formatDateShort(date) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Helper: Escape HTML
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app when DOM is ready
let app;
document.addEventListener("DOMContentLoaded", () => {
  app = new PlannerApp();
});
