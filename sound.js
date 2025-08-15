let running = false;
let timerId = null;

const GC_AUDIO_DATA = "data:audio/wav;base64,UklGRkwFAABXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YSgFAADIAPj+e//d/Wj9u/zf/In7Ev7s+rj/GftpAAP7kv9l+3L+t/3f/eMAOv/UAeADRQCLB9X+AAad/r0Czv6MARUASAC8AlD+dAOj/RUAbP5P/FX/y/tU/nD91/yS/o3+/f/KASsB6AZl/WQYi/DVO7TXoGWhsYN/3Y5PdCaO5j9yt031mvV3sKQ0t4kbZTeDS3oWhMF8UoY1d9anJ1zS6yQnUCty7xFQ9MbOXL+zyVTGuBlD6cfAMDTTLBSi5Ybn3AlVtlg34ZE4XzyF23PRhip1j4QZdKeDI3QllvVlfsbTQSEUOgivXmvE3HywkjZ8vYDLfw2C+3eTku9L67WEDRbilNWtDpStMTiDnHNQAqJ0T3C1skDuz9ktqu2YFm0SSvo/P7jXY2acr9x7cY4dez+HBlr5oc8cVNTN4FQKS7tvMlCuN0OJufQ8bdmKJp0D7ga9LJ3kfEgtyIxPQLktRtC6oTQnycYgd9s0D//p1QNg8koAyPak/hf8V/ZBBajshg027+MN0f2IBdkNzfjVGabsAyIA5LMmj97nJZvcrBuA4Z4IeO8p8yoDquJ3FJ3dzxvs5bEXKvZMDKEGG//wD3T17g268nQFb/Yy/hr9mflMA4z2yQc09d4KyPVhDOj38wv198wLYfHGDtDmGxXc3rgbNd2cHRbjMxgi7q8OwfimBrP/bQKaAKgC2fhdCBnssRJa4asdzduTJJHcCiVk4+AfSu1lF8z29w2d+4AG6PhBAznzjAQl8EgI9O4eC4buQAtW8AoLt/N3DfD1bREq9RUUvPH9E1TvhRFd8SINR/dGB4j+cgCCBDT6xwfG9ucHWfdGBAz8CP26A2j1fwvh8JkQUfAsEknzYxAh+dwLogGQBX0Lx/1dEoX1hRPW71gRY++YDujyCws797UGD/pTAwj7EAO3+u0FLvo8CD368Aey+mcHXvqoCKX4Cgvf9YsNqvK1D2DvNxF/7C0S8OpNEgrssRBG8B4OD/ZiDDv6bQyr+l4MvPitCur2lAlQ9ewKIfMkDFTxSQvo8HkKg/GUC5fyyQ3U86sOGvXnDID2yAmJ9zoHvvdtBUr4sAOZ+pwB7/2+/8z/AwDt/l4Cr/yXBGr7CwYp+wcHl/rnBQH6UgIm+4P++f3v+xcB4vojA8z6BgSo+n0EY/pgBcj6cQbr+z0H6PyKB3r8WQeF+rYGi/g8Bgn3RAd39RkKmvR4DFT0jQxB804LPvKZCpzy4gqJ8wYLlfQcCuz11AhU9pgIsfVNCdL1twkJ92kJ8/fgCF339gjW9ZMJLfVrCb31CQj89WwGQfboBCH3aQO49wADxfcHBMz4dAWo+mwGlvxzBmr+WAUy/+4Dff5BA4v97wL6/K4CL/xXAkH7eAEn+97/9/tP/gf9rf3A/Q3+pf66/ogA5v6+Anr+PAQM/r8E4v2mBKv9PwQq/e8DRvzGA3b7ZAMW+w0DDvvxAub6NgNo+t0D4/nmBMf5rQU9+vQFx/onBtL6zAZu+qIHdPqdBzf7Zwbt+/0Elfu6BCz6fwXv+DgGm/jVBSX56gTP+WUEcPqMBCP7iQTi+y8EHfzRA7P74QMN+2EEzvo1BfT6CQZI+3oGmfsWBvL74gQp/H0DIfysAjX8dQLb/E4CEv7SATH/PAHJ/yIBCQCSAWkADQLCADgCxwA5AmEAKwImAPIBTQBgAWMAhAAoAJP/FwAH/5kAAf+CAWX/+QG9/9kBq/+oAQH/FgIU/sICS/3xAvz8dAI4/fYB1v3hAYr++wE=";


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
  clickBuffer = await loadAudioFile(GC_AUDIO_DATA); // 'gc.wav' is replaced with base64 data
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
