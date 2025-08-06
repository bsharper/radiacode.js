let running = false;
let timerId = null;


function updateCpsHandler (event) {
        //console.log('Received event:', event.detail);
        const cps = event.detail.cps;
        initializeAudio(); 
        runGeiger(cps);
};

function getExponentialDelay(cps) {
    // Return a delay in milliseconds based on exponential distribution
    return -Math.log(1 - Math.random()) / cps * 1000;
}

function runGeiger(cps) {
    if (running) {
        clearTimeout(timerId);
    } else {
        running = true;
    }
    const delay = getExponentialDelay(cps);
    timerId = setTimeout(() => {
        playClickSound();
        runGeiger(cps); 
    }, delay);
}


let audioCtx = null;
let clickPool = null;
let poolIndex = 0;
const POOL_SIZE = 8;
const oscTypes = ['sine', 'square', 'sawtooth', 'triangle'];

function initializeAudio() {
  if (audioCtx) return; // Already initialized
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Auto-resume context on first user interaction
  if (audioCtx.state === 'suspended') {
    document.body.addEventListener('click', () => audioCtx.resume(), { once: true });
  }

  clickPool = Array.from({ length: POOL_SIZE }, (el, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = // oscTypes[i%oscTypes.length] //oscTypes[Math.floor(Math.random() * oscTypes.length)];
    osc.type = "square";
    osc.frequency.setValueAtTime(3800 + parseInt(Math.random() * 400), audioCtx.currentTime);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); 

    return { osc, gain };
  });
}

function playClickSound() {
  if (!audioCtx || !clickPool) {
    initializeAudio();
  }
  
  const node = clickPool[poolIndex];
  poolIndex = (poolIndex + 1) % POOL_SIZE;

  const now = audioCtx.currentTime;

  node.gain.gain.cancelScheduledValues(now);
  node.gain.gain.setValueAtTime(0.5, now);
  node.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
  node.gain.gain.setValueAtTime(0, now + 0.015);
}

function startSoundEvent() {

    window.addEventListener('update-cps', updateCpsHandler);
}

function stopSoundEvent() {
    if (running) {
        clearTimeout(timerId);
        running = false;
    }
    console.log('Geiger stopped');
    window.removeEventListener('update-cps', updateCpsHandler);
}
