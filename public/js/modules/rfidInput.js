// RFID Input Handler
// Captures keyboard input from RFID reader (sends as keystrokes)

const RfidInput = {
  codeBuffer: '',
  onCodeScanned: null,
  enabled: true,

  init(callback) {
    this.onCodeScanned = callback;
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  },

  handleKeyDown(e) {
    if (!this.enabled) return;

    // Ignore if focus is on an input/button element
    if (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'SELECT'
    ) {
      return;
    }

    const key = e.key;

    // Number keys: accumulate code
    if (key >= '0' && key <= '9') {
      e.preventDefault();
      if (this.codeBuffer.length >= 5) {
        this.codeBuffer = key;
      } else {
        this.codeBuffer += key;
      }

      this.onBufferUpdate(this.codeBuffer);

      if (this.codeBuffer.length === 5) {
        const code = this.codeBuffer;
        this.codeBuffer = '';
        if (this.onCodeScanned) {
          this.onCodeScanned(code);
        }
      }
      return;
    }

    // Enter key: submit partial code (for manual input)
    if (key === 'Enter') {
      e.preventDefault();
      if (this.codeBuffer.length === 5 && this.onCodeScanned) {
        const code = this.codeBuffer;
        this.codeBuffer = '';
        this.onCodeScanned(code);
      }
      return;
    }

    // Escape: clear buffer
    if (key === 'Escape') {
      this.codeBuffer = '';
      this.onBufferUpdate('');
      return;
    }
  },

  onBufferUpdate(buffer) {
    // Override this for UI updates
    const indicator = document.getElementById('rfid-indicator');
    if (indicator) {
      if (buffer.length > 0) {
        indicator.textContent = '\u25CF'.repeat(buffer.length) + '\u25CB'.repeat(5 - buffer.length);
        indicator.classList.remove('hidden');
      } else {
        indicator.classList.add('hidden');
      }
    }
  },

  clearBuffer() {
    this.codeBuffer = '';
    this.onBufferUpdate('');
  },

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.clearBuffer();
  },
};

window.RfidInput = RfidInput;
