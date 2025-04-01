// src/main.js (Using fetch for Google AI API)

console.log('--- [main.js] Starting Execution ---');

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
// Note: NO @google/genai require statement

// Load environment variables from .env file
try {
    require('dotenv').config();
    console.log('[main.js] dotenv loaded.');
} catch (error) {
    console.error('[main.js] FAILED to load dotenv.', error);
}

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Read API Key from .env
const GEMINI_MODEL_NAME = 'gemini-2.0-flash'; // Model that supports images

// Initial check for API Key
if (!GEMINI_API_KEY) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("[main.js] CRITICAL: GEMINI_API_KEY missing from .env! API calls will fail.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
} else {
    // Avoid logging the full key, just confirm its presence and length
    console.log(`[main.js] GEMINI_API_KEY loaded (Length: ${GEMINI_API_KEY.length}).`);
}
// --- End Configuration ---

let mainWindow = null; // Keep global reference

// --- Function to Create Application Window ---
function createWindow() {
    try {
        console.log('[main.js] Attempting to create BrowserWindow...');
        mainWindow = new BrowserWindow({
            width: 450, height: 600,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'), // Ensure preload path is correct
                contextIsolation: true, nodeIntegration: false,
            },
            resizable: true, frame: true,
        });
        console.log('[main.js] BrowserWindow created successfully.');

        mainWindow.on('closed', () => {
            console.log('[main.js] mainWindow closed event triggered.');
            mainWindow = null;
        });

        const htmlPath = path.join(__dirname, 'renderer/index.html');
        try {
            console.log(`[main.js] Attempting to load file: ${htmlPath}`);
            mainWindow.loadFile(htmlPath);
            console.log('[main.js] loadFile command issued successfully.');
        } catch (loadError) {
            console.error(`[main.js] FAILED to load file: ${htmlPath}`, loadError);
        }

        console.log('[main.js] Opening DevTools...');
        mainWindow.webContents.openDevTools(); // Keep DevTools open for debugging

    } catch (creationError) {
        console.error('[main.js] FAILED to create BrowserWindow:', creationError);
        app.quit(); return;
    }
}

// --- IPC Handler for Posture Analysis (Using fetch) ---
ipcMain.handle('analyze-posture', async (_event, imageDataUrl) => {
    console.log('[main.js] Received analyze-posture request via IPC (using fetch).');

    // 1. Check if API Key exists
    if (!GEMINI_API_KEY) {
        const errorMsg = 'GEMINI_API_KEY missing from .env.';
        console.error(`[main.js] Cannot analyze posture: ${errorMsg}`);
        mainWindow?.webContents.send('posture-result', { posture: 'error', reason: errorMsg });
        return { status: 'error', message: errorMsg };
    }

    // 2. Validate image data
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/jpeg;base64,')) {
        console.error('[main.js] Invalid image data URL received.');
        mainWindow?.webContents.send('posture-result', { posture: 'error', reason: 'Invalid image data format.' });
        return { status: 'error', message: 'Invalid image data format.' };
    }

    try {
        // 3. Extract base64 data
        const base64Image = imageDataUrl.split(',')[1];
        if (!base64Image) throw new Error("Failed to extract base64 data from image URL.");

        // 4. Prepare API URL and request body
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
        const textPrompt = "Analyze the posture of the person in this image. Focus on whether they are sitting upright suitable for working at a computer, or if they are slouching, hunching, or leaning too far forward/backward. Respond ONLY with JSON containing 'posture': 'good' or 'posture': 'bad'. If 'bad', optionally include a brief 'reason'. Example good: {\"posture\": \"good\"}. Example bad: {\"posture\": \"bad\", \"reason\": \"Slouching forward\"}.";
        const requestBody = {
            contents: [{
                parts: [
                    { text: textPrompt },
                    { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                ]
            }],
            // Optional: Add generationConfig if needed
             generationConfig: {
                 // stopSequences: ["}"], // Might help ensure valid JSON but can also cut off output
                 maxOutputTokens: 150,
                 temperature: 0.2, // Lower temperature for more predictable JSON output
                 // responseMimeType: "application/json" // Check if model supports this for direct JSON
             }
        };

        // 5. Make the API call using fetch
        console.log(`[main.js] Sending POST request to Gemini API (using fetch)...`);
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        console.log(`[main.js] Received response status: ${response.status}`);
        const responseData = await response.json(); // Always try to parse JSON, even for errors

        // 6. Check for HTTP errors
        if (!response.ok) {
            // Try to get specific error message from Google's structured error response
            const errorDetails = responseData?.error?.message || `HTTP error ${response.status}`;
            console.error("[main.js] Google AI API Error Response:", JSON.stringify(responseData, null, 2));
            throw new Error(`API request failed: ${errorDetails}`);
        }

        console.log("[main.js] Received successful response data.");
        // console.log(JSON.stringify(responseData, null, 2)); // Optional: Log full successful response

        // 7. Process the successful response
        // Structure is usually responseData.candidates[0].content.parts[0].text
        if (!responseData?.candidates?.[0]?.content?.parts?.[0]?.text) {
             const blockReason = responseData?.promptFeedback?.blockReason;
             const safetyRatings = responseData?.candidates?.[0]?.safetyRatings;
             let errorReason = 'Invalid response structure';
             if (blockReason) {
                 errorReason = `Request blocked, reason: ${blockReason}. Check safety settings or prompt.`;
             } else if (safetyRatings) {
                 errorReason = `Response content filtered due to safety ratings. Check safety settings. Ratings: ${JSON.stringify(safetyRatings)}`;
             }
             console.error("[main.js] Invalid response structure from Gemini API:", responseData);
             throw new Error(`Could not extract text from Gemini response (${errorReason}).`);
        }
        const modelOutputText = responseData.candidates[0].content.parts[0].text;
        console.log("[main.js] Model output text:", modelOutputText);

        try {
            // 8. Parse JSON from the model's text response
            const jsonMatch = modelOutputText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[2]) : modelOutputText;
            const jsonResponse = JSON.parse(jsonString);
            console.log('[main.js] Parsed JSON response:', jsonResponse);

            if (typeof jsonResponse.posture !== 'string') {
                 throw new Error("Response JSON missing 'posture' string field.");
            }

            // 9. Send result back to renderer
            mainWindow?.webContents.send('posture-result', jsonResponse);
            return { status: 'ok' };

        } catch (parseError) {
            console.error('[main.js] Failed to parse JSON from Gemini response text:', responseText, parseError);
            mainWindow?.webContents.send('posture-result', { posture: 'error', reason: 'Failed to parse analysis JSON from model response.' });
            return { status: 'error', message: 'Failed to parse analysis JSON.' };
        }

    } catch (error) {
        // 10. Handle any errors during the process
        console.error('[main.js] ERROR analyzing posture using fetch:', error);
        mainWindow?.webContents.send('posture-result', { posture: 'error', reason: error.message || 'Unknown error during analysis.' });
        return { status: 'error', message: error.message || 'Unknown error.' };
    }
});
// --- End IPC Handler ---

// --- Electron App Lifecycle Events ---
app.whenReady().then(() => {
    console.log('[main.js] App ready event received.');
    if (!GEMINI_API_KEY) {
        console.error('[main.js] WARNING: GEMINI_API_KEY missing from .env. Analysis will fail.');
    }
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => { console.error('[main.js] FAILED app.whenReady:', error); app.quit(); });

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { console.log('[main.js] Event: before-quit'); });

console.log('[main.js] Main script execution finished.');