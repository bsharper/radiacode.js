let running = false;
let timerId = null;


async function updateCpsHandler (event) {
        //console.log('Received event:', event.detail);
        const cps = event.detail.cps;
        await initializeAudio(); 
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
let clickBuffer = null;

async function loadAudioFile(url) {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (error) {
    console.error('Error loading audio file:', error);
    return null;
  }
}

async function initializeAudio() {
  if (audioCtx) return; // Already initialized
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Auto-resume context on first user interaction
  if (audioCtx.state === 'suspended') {
    document.body.addEventListener('click', () => audioCtx.resume(), { once: true });
  }

  // Load the gc.wav file
  clickBuffer = await loadAudioFile('gc.wav');
  if (!clickBuffer) {
    console.error('Failed to load gc.wav file');
  }
}

function playClickSound() {
  if (!audioCtx || !clickBuffer) {
    console.warn('Audio context or click buffer not ready');
    return;
  }
  
  // Create a new buffer source for each play
  const source = audioCtx.createBufferSource();
  source.buffer = clickBuffer;
  
  // Optional: Add gain control for volume
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
  
  // Connect the audio graph
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  // Play the sound
  source.start(0);
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
