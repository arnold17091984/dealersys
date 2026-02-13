// Timer Display - Bet timer countdown

const TimerDisplay = {
  timerEl: null,
  timerBarEl: null,
  interval: null,
  remaining: 0,
  total: 0,

  init(timerEl, timerBarEl) {
    this.timerEl = timerEl;
    this.timerBarEl = timerBarEl;
  },

  start(seconds) {
    this.stop();
    this.total = seconds;
    this.remaining = seconds;
    this.update();

    this.interval = setInterval(() => {
      this.remaining--;
      this.update();

      if (this.remaining <= 0) {
        this.stop();
        if (this.onExpired) this.onExpired();
      }
    }, 1000);

    if (this.timerEl) {
      this.timerEl.parentElement.classList.remove('hidden');
    }
  },

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },

  isRunning() {
    return this.interval !== null;
  },

  hide() {
    this.stop();
    if (this.timerEl) {
      this.timerEl.parentElement.classList.add('hidden');
    }
  },

  update() {
    if (this.timerEl) {
      this.timerEl.textContent = this.remaining;
      if (this.remaining <= 5) {
        this.timerEl.classList.add('text-red-500', 'animate-pulse');
      } else {
        this.timerEl.classList.remove('text-red-500', 'animate-pulse');
      }
    }
    if (this.timerBarEl) {
      const pct = this.total > 0 ? (this.remaining / this.total) * 100 : 0;
      this.timerBarEl.style.width = pct + '%';
      if (this.remaining <= 5) {
        this.timerBarEl.classList.add('bg-red-500');
        this.timerBarEl.classList.remove('bg-yellow-400');
      } else {
        this.timerBarEl.classList.remove('bg-red-500');
        this.timerBarEl.classList.add('bg-yellow-400');
      }
    }
  },

  onExpired: null,
};

window.TimerDisplay = TimerDisplay;
