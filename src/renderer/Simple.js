// test-genai-simple.js
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai'); // Use the correct import method for Node CJS

console.log('--- Starting Simple @google/genai Connection Test ---');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('🔴 ERROR: GEMINI_API_KEY not found in .env file.');
  process.exit(1);
} else {
  console.log('✅ API Key found.');
}

// Use the exact structure from user example, adapting require for CJS
const genAI = new GoogleGenAI(apiKey); // Pass only the key string

async function main() {
  try {
    console.log('   Initializing model and sending request...');
    // Mimic user example: call generateContent on .models, pass model name and simple string contents
    const result = await genAI.models.generateContent({
      model: "gemini-pro", // Standard text model
      contents: "Explain how AI works in one short sentence.", // Simple text prompt as string
    });

    // Need to get response text correctly for this library version
    // Assuming result structure might be { response: { text: () => "..." } } or similar
    // Let's try accessing the response and text method safely
    if (result && result.response && typeof result.response.text === 'function') {
        const response = result.response;
        const text = response.text();
        console.log('✅ --- API Call Successful! ---');
        console.log('   Model Response:', text);
    } else {
         console.warn('⚠️ Received response, but structure might be unexpected.');
         console.log('   Full Result:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('🔴 --- ERROR During API Call ---');
    console.error('   Error message:', error.message);
    if (error.message && error.message.includes('Could not load the default credentials')) {
        console.warn('   ⚠️ This indicates the library is still trying to use ADC/Cloud credentials.');
    } else if (error.message && error.message.includes('API key not valid')) {
         console.warn('   ⚠️ Check if the GEMINI_API_KEY in your .env file is correct and active.');
    }
     // console.error('   Full Error:', error); // Uncomment for more details
  }
}

// Execute the main function
main();