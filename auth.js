// ================================================================
// Auth Manager — Supabase email/password authentication
// ================================================================
class AuthManager {
  constructor() {
    this.client = null;
    this.user = null;
    this.profile = null;
    this._listeners = [];
  }

  init(supabaseClient) {
    this.client = supabaseClient;

    // Listen for future auth state changes
    this.client.auth.onAuthStateChange(async (event, session) => {
      this.user = session?.user ?? null;
      if (this.user) {
        try { await this._loadProfile(); } catch (e) { console.error('Profile load error:', e); }
      } else {
        this.profile = null;
      }
      this._notify();
    });

    // Load existing session on page load — always notify so UI updates
    this.client.auth.getSession().then(({ data: { session } }) => {
      this.user = session?.user ?? null;
      if (this.user) {
        this._loadProfile()
          .then(() => this._notify())
          .catch(() => this._notify());
      } else {
        this._notify();
      }
    });
  }

  async _loadProfile() {
    if (!this.user || !this.client) return;
    const { data } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();

    if (data) {
      this.profile = data;
    } else {
      // Create profile row on first login
      const { data: newProfile } = await this.client
        .from('profiles')
        .insert({ id: this.user.id, is_pro: false })
        .select()
        .single();
      this.profile = newProfile;
    }
  }

  isLoggedIn() {
    return !!this.user;
  }

  isPro() {
    if (!this.profile) return false;
    // Paid Pro
    if (this.profile.is_pro) {
      if (this.profile.pro_expires_at) {
        return new Date(this.profile.pro_expires_at) > new Date();
      }
      return true;
    }
    // Free trial counts as Pro
    return this.isOnTrial();
  }

  isOnTrial() {
    if (!this.profile || this.profile.is_pro) return false;
    if (!this.profile.trial_ends_at) return false;
    return new Date(this.profile.trial_ends_at) > new Date();
  }

  trialDaysLeft() {
    if (!this.profile?.trial_ends_at) return 0;
    const diff = new Date(this.profile.trial_ends_at) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  async getJwt() {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  onChange(cb) {
    this._listeners.push(cb);
  }

  _notify() {
    this._listeners.forEach(cb => cb(this.user, this.profile));
  }

  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  async refreshProfile() {
    await this._loadProfile();
    this._notify();
  }
}

const auth = new AuthManager();
