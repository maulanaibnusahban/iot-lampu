// UI Elements
const body = document.body;
const ambientGlow = document.getElementById('ambientGlow');
const statusBadge = document.getElementById('statusBadge');
const statusText = statusBadge.querySelector('.status-text');
const stateText = document.getElementById('stateText');

const switchTrack = document.getElementById('switchTrack');
const switchHandle = document.getElementById('switchHandle');
const trackFill = document.getElementById('trackFill');

const consoleDrawer = document.getElementById('consoleDrawer');
const consoleToggle = document.getElementById('consoleToggle');
const consoleLogs = document.getElementById('consoleLogs');

// State Variables
let isLampOn = false;
let socket = null;
let reconnectTimer = null;
let reconnectDelay = 2000; // start with 2s
const maxReconnectDelay = 16000;
let wsUrl = '';

// Drag state variables
let isDragging = false;
let startY = 0;
let startBottom = 0;
let maxDrag = 0;
let currentBottom = 0;

// Web Audio variables
let audioCtx = null;

// Initialize System
window.addEventListener('DOMContentLoaded', () => {
  // Determine WebSocket URL dynamically based on current host
  const host = window.location.host || 'localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  wsUrl = `${protocol}${host}`;

  // Run initializations inside try/catch so one failure doesn't halt others
  try {
    initWebSocket();
  } catch (e) {
    console.error('Failed to init WebSocket:', e);
  }

  try {
    setupSwitchDragging();
  } catch (e) {
    console.error('Failed to init switch dragging:', e);
  }

  try {
    setupConsoleDrawer();
  } catch (e) {
    console.error('Failed to init console drawer:', e);
  }
});

// --- Console Log Helper ---
function logToConsole(message, type = 'system') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span style="opacity: 0.5">[${time}]</span> ${message}`;
  consoleLogs.appendChild(entry);
  
  // Auto-scroll console to bottom
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// --- Web Audio Tactile Sound Synthesizer ---
function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio API not supported in this browser');
  }
}

function playClickSound() {
  initAudio();
  if (!audioCtx) return;
  
  // Resume if suspended by browser autoplay policy
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const now = audioCtx.currentTime;
  
  // 1. Low frequency thump (housing vibration)
  const lowOsc = audioCtx.createOscillator();
  const lowGain = audioCtx.createGain();
  
  lowOsc.type = 'sine';
  lowOsc.frequency.setValueAtTime(140, now);
  lowOsc.frequency.exponentialRampToValueAtTime(10, now + 0.08);
  
  lowGain.gain.setValueAtTime(0.5, now);
  lowGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
  
  lowOsc.connect(lowGain);
  lowGain.connect(audioCtx.destination);
  
  // 2. High frequency click (mechanical contacts snapping)
  const highOsc = audioCtx.createOscillator();
  const highGain = audioCtx.createGain();
  
  highOsc.type = 'triangle';
  highOsc.frequency.setValueAtTime(1200, now);
  highOsc.frequency.exponentialRampToValueAtTime(100, now + 0.02);
  
  highGain.gain.setValueAtTime(0.2, now);
  highGain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);
  
  highOsc.connect(highGain);
  highGain.connect(audioCtx.destination);
  
  // Start and stop
  lowOsc.start(now);
  lowOsc.stop(now + 0.08);
  highOsc.start(now);
  highOsc.stop(now + 0.02);
}

// --- WebSocket Operations ---
function initWebSocket() {
  if (socket) {
    socket.close();
  }
  
  clearTimeout(reconnectTimer);
  
  logToConsole(`Menghubungkan ke ${wsUrl}...`, 'system');
  statusBadge.className = 'status-badge'; // reset
  statusText.textContent = 'Menghubungkan';
  
  try {
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      reconnectDelay = 2000; // reset backoff
      statusBadge.className = 'status-badge connected';
      statusText.textContent = 'Terhubung';
      logToConsole(`WebSocket terhubung ke ${wsUrl}`, 'success');
      
      // Register client
      socket.send(JSON.stringify({ type: 'web' }));
    };
    
    socket.onmessage = (event) => {
      logToConsole(`Menerima pesan: ${event.data}`, 'received');
      // In case the server returns state updates:
      try {
        const data = JSON.parse(event.data);
        if (data.command) {
          updateUIState(data.command === 'ON');
        }
      } catch (e) {
        // simple text payload or invalid JSON
      }
    };
    
    socket.onclose = () => {
      statusBadge.className = 'status-badge disconnected';
      statusText.textContent = 'Terputus';
      logToConsole(`Koneksi terputus. Mencoba ulang dalam ${reconnectDelay / 1000}s...`, 'error');
      
      // Auto-reconnect with exponential backoff
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
        initWebSocket();
      }, reconnectDelay);
    };
    
    socket.onerror = (error) => {
      logToConsole(`Kesalahan WebSocket terjadi`, 'error');
    };
    
  } catch (err) {
    logToConsole(`Gagal menginisialisasi WebSocket: ${err.message}`, 'error');
    statusBadge.className = 'status-badge disconnected';
    statusText.textContent = 'Gagal';
  }
}

// --- Switch Interaction & Dragging (Lever Logic) ---
function setupSwitchDragging() {
  // Update measurements
  updateDragMetrics();
  
  // Recalculate values on resize/orientation change
  window.addEventListener('resize', () => {
    updateDragMetrics();
    // Re-adjust handle position to snap cleanly based on state
    setHandlePosition(isLampOn ? maxDrag : 0, false);
  });
  
  // Pointer events (handles Mouse and Touch simultaneously)
  switchHandle.addEventListener('pointerdown', onDragStart);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  
  // Click on track anywhere to jump switch
  switchTrack.addEventListener('click', (e) => {
    // If handle itself was clicked/dragged, don't trigger track jump
    if (e.target.closest('#switchHandle')) return;
    
    initAudio();
    
    const rect = switchTrack.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickPercent = 1 - (clickY / rect.height); // 0 at bottom, 1 at top
    
    const targetState = clickPercent >= 0.5;
    triggerLampState(targetState);
  });
}

function updateDragMetrics() {
  maxDrag = switchTrack.clientHeight - switchHandle.clientHeight - 12; // 12 accounts for 6px padding top & bottom
  // Initialize bottom position based on current lamp state
  setHandlePosition(isLampOn ? maxDrag : 0, false);
}

function setHandlePosition(bottomPx, animate = true) {
  currentBottom = bottomPx;
  
  if (animate) {
    switchHandle.classList.add('snapping');
  } else {
    switchHandle.classList.remove('snapping');
  }
  
  // Set position
  switchHandle.style.bottom = `${bottomPx + 6}px`; // +6px padding offset
  
  // Set fill height percentage
  const percent = maxDrag > 0 ? (bottomPx / maxDrag) * 100 : 0;
  trackFill.style.height = `${percent}%`;
}

function onDragStart(e) {
  e.preventDefault();
  initAudio();
  isDragging = true;
  startY = e.clientY;
  startBottom = currentBottom;
  switchHandle.classList.remove('snapping');
  
  // Set pointer capture to receive events even if cursor goes outside the track boundaries
  switchHandle.setPointerCapture(e.pointerId);
}

// Global move handler to ensure smooth tracking outside the element
function onDragMove(e) {
  if (!isDragging) return;
  
  const currentY = e.clientY;
  const dy = startY - currentY; // Moving up reduces clientY, increasing dy
  let targetBottom = startBottom + dy;
  
  // Clamp within bounds
  targetBottom = Math.max(0, Math.min(maxDrag, targetBottom));
  setHandlePosition(targetBottom, false);
}

function onDragEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  
  // Release pointer capture
  try {
    switchHandle.releasePointerCapture(e.pointerId);
  } catch (err) {}
  
  // Snap evaluation
  const currentPercent = maxDrag > 0 ? (currentBottom / maxDrag) : 0;
  const targetState = currentPercent >= 0.5;
  
  triggerLampState(targetState);
}

// --- Lamp Controls ---
function triggerLampState(turnOn) {
  // Play sound if state is changing
  if (isLampOn !== turnOn) {
    playClickSound();
  }
  
  updateUIState(turnOn);
  sendWebSocketCommand(turnOn ? 'ON' : 'OFF');
}

function updateUIState(turnOn) {
  isLampOn = turnOn;
  
  // Apply state-on classes to body (triggers SVG transitions & layout colors)
  if (turnOn) {
    body.classList.add('state-on');
    stateText.textContent = 'LAMPU MENYALA';
    if (maxDrag > 0) setHandlePosition(maxDrag, true);
  } else {
    body.classList.remove('state-on');
    stateText.textContent = 'LAMPU PADAM';
    setHandlePosition(0, true);
  }
}

function sendWebSocketCommand(command) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify({
      type: 'web',
      command: command
    });
    socket.send(payload);
    logToConsole(`Mengirim perintah: ${command}`, 'sent');
  } else {
    logToConsole(`Gagal mengirim: Tidak terhubung ke server WebSocket`, 'error');
  }
}

// --- Console Drawer Controller ---
function setupConsoleDrawer() {
  consoleToggle.addEventListener('click', () => {
    consoleDrawer.classList.toggle('open');
  });
}
