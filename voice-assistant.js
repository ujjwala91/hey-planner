// ================================================================
// Voice Assistant — TTS responses and audio feedback
// ================================================================
class VoiceAssistant {
  constructor() {
    this.synthesis = window.speechSynthesis;
    this.voice = null;
    this.isSpeaking = false;
    this.isEnabled = true;
    this.initVoice();
  }

  // Initialize preferred voice
  initVoice() {
    if (this.synthesis) {
      // Wait for voices to load
      if (this.synthesis.getVoices().length === 0) {
        this.synthesis.addEventListener("voiceschanged", () => {
          this.selectVoice();
        });
      } else {
        this.selectVoice();
      }
    }
  }

  // Select best voice (prefer female English voices)
  selectVoice() {
    const voices = this.synthesis.getVoices();

    // Prefer specific voices in order
    const preferredVoices = [
      "Google US English Female",
      "Microsoft Zira Desktop",
      "Samantha",
      "Victoria",
      "Karen",
      "female",
      "en-US",
    ];

    for (const preferred of preferredVoices) {
      const voice = voices.find(
        (v) => v.name.includes(preferred) || v.lang.includes(preferred),
      );
      if (voice) {
        this.voice = voice;
        return;
      }
    }

    // Fallback to first English voice
    this.voice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
  }

  // Speak text with voice
  speak(text, options = {}) {
    if (!this.synthesis || !this.isEnabled) return;

    // Stop any current speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    if (this.voice) {
      utterance.voice = this.voice;
    }

    utterance.rate = options.rate || 1.1; // Slightly faster like Alexa
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 0.8;

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.onSpeakStart && this.onSpeakStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.onSpeakEnd && this.onSpeakEnd();
    };

    utterance.onerror = (error) => {
      console.error("Speech synthesis error:", error);
      this.isSpeaking = false;
    };

    this.synthesis.speak(utterance);
  }

  // Stop speaking
  stop() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeaking = false;
    }
  }

  // Toggle voice responses
  toggle() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  // Alexa-like responses for different intents
  getResponse(intent, data = {}) {
    const responses = {
      // Wake word detected
      wakeWord: ["Yes?", "I'm listening", "Go ahead", "Yes, I'm here"],

      // Task created
      taskCreated: [
        `Got it. I've added ${data.task} to your tasks.`,
        `Okay. ${data.task} has been added.`,
        `Done. I've created a task for ${data.task}.`,
        `Noted. ${data.task} is now on your list.`,
      ],

      // Task completed
      taskCompleted: [
        `Great job! I've marked ${data.task} as complete.`,
        `Nice work! ${data.task} is done.`,
        `Excellent! ${data.task} has been completed.`,
        `Well done! I've checked off ${data.task}.`,
      ],

      // Task updated
      taskUpdated: [
        `Okay, I've updated ${data.task}.`,
        `Got it. ${data.task} has been updated with your notes.`,
        `Done. Your update for ${data.task} has been saved.`,
      ],

      // Multiple tasks logged
      multipleTasksLogged: [
        `Impressive! I've logged ${data.count} completed tasks.`,
        `Great work! I've added ${data.count} tasks to your log.`,
        `Nice! ${data.count} tasks have been saved.`,
      ],

      // Grammar corrected
      grammarCorrected: [
        `I understood you, and corrected a few things.`,
        `Got it. I've cleaned that up for you.`,
      ],

      // Couldn't understand
      notUnderstood: [
        `Sorry, I didn't quite catch that. Could you try again?`,
        `I'm not sure I understood. Can you repeat that?`,
        `Hmm, I didn't get that. Please try again.`,
      ],

      // Error
      error: [
        `Sorry, something went wrong. Please try again.`,
        `Oops, I encountered an error. Let's try that again.`,
      ],

      // Listening mode disabled
      listeningDisabled: [
        `Okay, I've stopped listening.`,
        `Listening mode disabled.`,
        `I'm no longer listening for the wake word.`,
      ],

      // Listening mode enabled
      listeningEnabled: [
        `I'm now listening. Just say "Hey Planner" when you're ready.`,
        `Listening mode enabled. Say "Hey Planner" to start.`,
        `I'm ready. Say "Hey Planner" anytime.`,
      ],

      // Greeting
      greeting: [
        `Welcome back! I'm ready to help you track your tasks.`,
        `Hello! Ready to log your accomplishments?`,
        `Hi there! What would you like to add today?`,
      ],
    };

    const options = responses[intent] || responses.notUnderstood;
    return options[Math.floor(Math.random() * options.length)];
  }

  // Speak response for intent (skips TTS if mic is active to avoid interference)
  respondTo(intent, data = {}) {
    // Don't speak when mic is actively listening — use beep only
    if (
      typeof speech !== "undefined" &&
      (speech.isPushToTalkMode ||
        speech.isContinuousMode ||
        speech.sessionActive)
    ) {
      if (intent === "wakeWord") {
        this.playListeningSound();
      } else {
        this.playAcknowledgment();
      }
      return this.getResponse(intent, data);
    }
    const response = this.getResponse(intent, data);
    this.speak(response);
    return response;
  }

  // Play acknowledgment sound (short beep)
  playAcknowledgment() {
    if (!this.isEnabled) return;

    // Create a short pleasant tone
    try {
      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Pleasant frequency
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.1,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.error("Audio playback error:", error);
    }
  }

  // Play listening sound (like Alexa's chime)
  playListeningSound() {
    if (!this.isEnabled) return;

    try {
      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();

      // Create ascending tone
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(
        600,
        audioContext.currentTime + 0.1,
      );
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.15,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (error) {
      console.error("Audio playback error:", error);
    }
  }

  // Event handlers
  onSpeakStart = null;
  onSpeakEnd = null;
}

// Initialize voice assistant
const voiceAssistant = new VoiceAssistant();
