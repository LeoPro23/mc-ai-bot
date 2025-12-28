const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // For some versions of the SDK/API, listModels might be on the client or a specific manager
    // The current SDK usually exposes it via the GoogleGenerativeAI instance or a model manager.
    // Let's try to get a model and see if we can list from the client if possible, 
    // or just try to use the API directly if the SDK doesn't expose listModels easily in this version.
    // Actually, the SDK has a specific way. Let's try the standard way.
    
    // Note: The Node.js SDK for Gemini might not have a direct listModels method on the main class in all versions.
    // However, we can try to just print what we can.
    // If the SDK doesn't support it easily, we can use a simple fetch to the REST API.
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log("No API KEY found in .env");
        return;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.models) {
        console.log("Available Models:");
        data.models.forEach(m => {
            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                console.log(`- ${m.name}`);
            }
        });
    } else {
        console.log("Error listing models:", data);
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();