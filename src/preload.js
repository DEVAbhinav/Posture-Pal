// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log("Preload script loading...");

contextBridge.exposeInMainWorld('electronAPI', {
    // Function to invoke posture analysis in the main process
    analyzePosture: (imageDataUrl) => ipcRenderer.invoke('analyze-posture', imageDataUrl),

    // Function to subscribe to results from the main process
    onPostureResult: (callback) => {
        const listener = (_event, result) => {
            console.log("Preload received posture-result:", result);
            callback(result);
        };
        ipcRenderer.on('posture-result', listener);
        // Return a function to remove the listener
        return () => {
            ipcRenderer.removeListener('posture-result', listener);
            console.log("Preload removed posture-result listener.");
        };
    }
});

console.log("Preload script loaded and API exposed.");