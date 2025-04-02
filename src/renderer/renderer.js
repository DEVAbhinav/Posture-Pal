// src/renderer/renderer.js

const webcamFeed = document.getElementById('webcamFeed');
const captureCanvas = document.getElementById('captureCanvas');
const statusDiv = document.getElementById('status');
const feedbackDiv = document.getElementById('feedback');
const postureResultP = document.getElementById('postureResult');
const breathingInstructionP = document.getElementById('breathingInstruction');
const apiKeyNoticeDiv = document.getElementById('apiKeyNotice'); // Can show general errors
const checkIntervalSpan = document.getElementById('checkIntervalSeconds');

const todoInput = document.getElementById('todoInput');
const todoListItemsContainer = document.getElementById('todoListItems');

const CHECK_INTERVAL_MS = 30 * 1000;
const FEEDBACK_DISPLAY_MS = 8 * 1000;

let stream = null;
let intervalId = null;
let isChecking = false;
let feedbackTimeoutId = null;
let removeResultListener = null; // To store the cleanup function for the listener

checkIntervalSpan.textContent = Math.round(CHECK_INTERVAL_MS / 1000);

// --- Initialization ---
async function initializeApp() {
    apiKeyNoticeDiv.classList.add('hidden'); // Hide notice initially
    statusDiv.textContent = 'Initializing Webcam...';
    try {
        await setupWebcam();
        setupIPCListener(); // Set up listener for results from main process
        startPostureChecks();
        setupTodoInputListener(); // Set up listener for todo input
        console.log("[renderer.js] App initialized successfully.");
    } catch (error) {
        console.error('Initialization failed:', error);
        statusDiv.textContent = `Error: ${error.message}`;
        apiKeyNoticeDiv.textContent = `Initialization Error: ${error.message}`; // Show init error
        apiKeyNoticeDiv.classList.remove('hidden');
    }
}

// --- Webcam Handling (Unchanged) ---
async function setupWebcam() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }}, audio: false });
        webcamFeed.srcObject = stream;
        webcamFeed.onloadedmetadata = () => {
            captureCanvas.width = webcamFeed.videoWidth;
            captureCanvas.height = webcamFeed.videoHeight;
            console.log(`Webcam started: ${webcamFeed.videoWidth}x${webcamFeed.videoHeight}`);
        };
        statusDiv.textContent = 'Webcam active. Monitoring posture...';
    } catch (err) {
        console.error("Error accessing webcam:", err);
        statusDiv.textContent = `Webcam Error: ${err.message}. Please grant permission.`;
        throw new Error(`Webcam access denied or failed: ${err.name}`);
    }
}

// --- Posture Checking Logic ---
function startPostureChecks() {
    if (!stream) {
        console.warn("Cannot start posture checks without webcam stream.");
        statusDiv.textContent = 'Webcam not available.';
        return;
    }
     if (!window.electronAPI?.analyzePosture) {
         console.error("Cannot start posture checks: analyzePosture API not available via preload.");
         statusDiv.textContent = 'Error: Communication channel missing.';
         apiKeyNoticeDiv.textContent = `Error: analyzePosture function not exposed via preload. Check preload.js.`;
         apiKeyNoticeDiv.classList.remove('hidden');
         return;
     }
    if (intervalId) { clearInterval(intervalId); }
    console.log(`Starting posture checks every ${CHECK_INTERVAL_MS / 1000} seconds.`);
    checkPosture(); // Run immediately
    intervalId = setInterval(checkPosture, CHECK_INTERVAL_MS);
}

function stopPostureChecks() {
     if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log("Posture checks stopped.");
        if (statusDiv.textContent !== 'Error: Communication channel missing.' && !statusDiv.textContent.includes('Webcam Error')) {
             statusDiv.textContent = 'Posture monitoring paused.';
        }
    }
}

async function checkPosture() {
    if (isChecking || !stream || !window.electronAPI?.analyzePosture) { return; }
    isChecking = true;
    statusDiv.textContent = 'Capturing image...';
    console.log("Checking posture...");

    try {
        const imageDataUrl = captureFrame();
        if (!imageDataUrl) throw new Error("Failed to capture frame.");

        statusDiv.textContent = 'Analyzing posture...';
        console.log("[renderer.js] Sending image data to main process via IPC...");
        await window.electronAPI.analyzePosture(imageDataUrl);

    } catch (error) {
        console.error("[renderer.js] Posture check initiation failed:", error);
        statusDiv.textContent = `Error: ${error.message}`;
        displayFeedback({ posture: 'error', reason: error.message });
        isChecking = false;
    }
     // isChecking will be reset in the IPC listener (`handlePostureResult`)
}

function captureFrame() {
     if (!stream || !webcamFeed.videoWidth) { console.error("Webcam stream not ready..."); return null; }
    const context = captureCanvas.getContext('2d');
    if (captureCanvas.width !== webcamFeed.videoWidth || captureCanvas.height !== webcamFeed.videoHeight) {
        captureCanvas.width = webcamFeed.videoWidth; captureCanvas.height = webcamFeed.videoHeight; }
    context.drawImage(webcamFeed, 0, 0, captureCanvas.width, captureCanvas.height);
    return captureCanvas.toDataURL('image/jpeg', 0.75);
}


// --- IPC Communication ---
function setupIPCListener() {
    console.log("[renderer.js] Setting up IPC listener for posture-result.");
    if (window.electronAPI?.onPostureResult) {
        removeResultListener = window.electronAPI.onPostureResult(handlePostureResult);
    } else {
         console.error("[renderer.js] ERROR: electronAPI.onPostureResult is not available! Check preload script.");
         statusDiv.textContent = "Error: Communication channel missing.";
         apiKeyNoticeDiv.textContent = `Error: onPostureResult function not exposed via preload. Check preload.js.`;
         apiKeyNoticeDiv.classList.remove('hidden');
    }
}

function handlePostureResult(analysis) {
     console.log("[renderer.js] Processing analysis result received via IPC:", analysis);
     statusDiv.textContent = 'Posture analysis complete.'; // Temporary status

     if (!analysis || typeof analysis.posture !== 'string') {
        console.warn("Received invalid analysis object via IPC:", analysis);
        displayFeedback({ posture: 'error', reason: 'Invalid analysis format received.' });
     } else {
        const posture = analysis.posture.toLowerCase();
        displayFeedback({ posture: posture, reason: analysis.reason });

         if (posture === 'error') {
             console.error("Analysis error reported from main process:", analysis.reason);
             apiKeyNoticeDiv.textContent = `Analysis Error: ${analysis.reason || 'Unknown error during analysis.'}`;
             apiKeyNoticeDiv.classList.remove('hidden');
         } else {
              apiKeyNoticeDiv.classList.add('hidden'); // Hide error notice on success
         }
     }

     isChecking = false;
     setTimeout(() => {
         if (statusDiv.textContent.startsWith('Error:') || statusDiv.textContent.endsWith('complete.')) {
             if(intervalId) statusDiv.textContent = 'Monitoring posture...';
         }
     }, 2000);
}

// --- UI Feedback (Unchanged) ---
function displayFeedback(feedbackData) {
    // ... (Keep the existing displayFeedback function) ...
    if (feedbackTimeoutId) { clearTimeout(feedbackTimeoutId); feedbackTimeoutId = null; }
    feedbackDiv.classList.remove('visible');
    requestAnimationFrame(() => {
        postureResultP.className = '';
        if (feedbackData.posture === 'good') {
            postureResultP.textContent = 'Posture: Good!'; postureResultP.classList.add('good');
            breathingInstructionP.textContent = 'Keep up the great work!';
             breathingInstructionP.style.cssText = 'font-style: normal; color: #f2f2f7;';
        } else if (feedbackData.posture === 'bad') {
            postureResultP.textContent = `Posture: Needs Improvement ${feedbackData.reason ? `(${feedbackData.reason})` : ''}`;
             postureResultP.classList.add('bad');
            breathingInstructionP.textContent = 'Take a deep breath in... and out. Sit up straight!';
            breathingInstructionP.style.cssText = 'font-style: italic; color: #ff9500;';
        } else { // Error case
             postureResultP.textContent = `Analysis Error`; postureResultP.classList.add('bad');
             breathingInstructionP.textContent = feedbackData.reason || 'Could not determine posture.';
             breathingInstructionP.style.cssText = 'font-style: normal; color: #ff3b30;';
        }
        feedbackDiv.classList.remove('hidden');
        setTimeout(() => { feedbackDiv.classList.add('visible'); }, 10);
        feedbackTimeoutId = setTimeout(() => {
            feedbackDiv.classList.remove('visible');
            setTimeout(() => {
                if (!feedbackDiv.classList.contains('visible')) {
                    feedbackDiv.classList.add('hidden');
                    if (intervalId && !statusDiv.textContent.includes('paused') && !statusDiv.textContent.includes('Error')) {
                         statusDiv.textContent = 'Monitoring posture...';
                    }
                }
            }, 500);
            feedbackTimeoutId = null;
        }, FEEDBACK_DISPLAY_MS);
    });
}

// --- NEW: To-Do List Logic ---

function setupTodoInputListener() {
    if (!todoInput) {
        console.error("Todo input element not found!");
        return;
    }
    // Use 'keydown' instead of 'keypress'
    todoInput.addEventListener('keydown', function (event) {
        // Check if the key pressed down was 'Enter'
        if (event.key === 'Enter') {
            event.preventDefault(); // Still good practice
            const taskText = todoInput.value.trim(); // Get trimmed text

            if (taskText !== '') {
                addTask(taskText); // Add the task to the list
                todoInput.value = ''; // Clear the input field
            }
        }
    });
    console.log("[renderer.js] Todo input listener set up (using keydown)."); // Updated log
}

function addTask(text) {
    if (!todoListItemsContainer) {
        console.error("Todo list items container not found!");
        return;
    }

    // 1. Create the main task item div
    const taskDiv = document.createElement('div');
    taskDiv.classList.add('todo-item');

    // 2. Create the span for the task text
    const taskTextSpan = document.createElement('span');
    taskTextSpan.textContent = text;

    // 3. Create the delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-button');
    deleteBtn.textContent = '×'; // Use '×' symbol for delete

    // 4. Add event listener to the delete button
    deleteBtn.addEventListener('click', function() {
        taskDiv.remove(); // Remove the entire task item div when clicked
        console.log(`Task deleted: "${text}"`);
    });

    // 5. Append text and button to the task div
    taskDiv.appendChild(taskTextSpan);
    taskDiv.appendChild(deleteBtn);

    // 6. Append the new task div to the list container
    //    Prepending adds it to the top (just above input)
    todoListItemsContainer.prepend(taskDiv);
    // Alternatively, use appendChild to add to the bottom:
    // todoListItemsContainer.appendChild(taskDiv);

    console.log(`Task added: "${text}"`);
}

// --- NEW: Sound Function ---

/**
 * Plays a short beep/buzzer sound using the Web Audio API.
 */
function playBeepSound() {
    try {
        // Initialize AudioContext lazily on first use (or after user interaction)
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!audioContext) {
                 console.error("Web Audio API is not supported in this environment.");
                 return; // Exit if AudioContext is not supported
            }
        }

        // Prevent issues if context is suspended (e.g., before user interaction)
        if (audioContext.state === 'suspended') {
             audioContext.resume(); // Attempt to resume it
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Configure the sound
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Start with low volume
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2); // Fade out quickly (0.2 seconds)

        oscillator.type = 'square'; // 'sine', 'square', 'sawtooth', 'triangle'
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // Frequency in Hz (A4 note)

        // Start and stop the sound
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2); // Stop after 0.2 seconds

        console.log("[renderer.js] Beep sound played.");

    } catch (error) {
        console.error("[renderer.js] Error playing sound:", error);
        // Fallback or disable sound if there's a persistent issue
        // Maybe try creating a new context next time?
        audioContext = null;
    }
}

// --- Start and Cleanup ---
initializeApp();

window.addEventListener('beforeunload', () => {
    console.log("[renderer.js] beforeunload event triggered.");
    stopPostureChecks();
    if (stream) { stream.getTracks().forEach(track => track.stop()); console.log("Webcam stream stopped."); }
    if (removeResultListener) { removeResultListener(); console.log("[renderer.js] Removed IPC listener."); }
});