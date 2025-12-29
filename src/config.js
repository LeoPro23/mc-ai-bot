require('dotenv').config()

module.exports = {
    // Configuración OLLAMA (Local/Easypanel)
    USE_OLLAMA: process.env.USE_OLLAMA === 'true' || false, // Desactivado por defecto si usamos Groq
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://software_ollama:11434', 
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'phi3', 

    // Configuración GROQ (Recomendado)
    USE_GROQ: process.env.USE_GROQ === 'true' || true,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', // O 'llama-3.1-8b-instant' para velocidad extrema

    // Configuración Legacy (Google)
    MODELO_A_USAR: 'gemini-2.0-flash-lite-preview-02-05',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,

    // Configuración Minecraft
    MAX_HISTORY: 10,
    MC_HOST: process.env.MC_HOST,
    MC_PORT: parseInt(process.env.MC_PORT) || 25565,
    MC_USER: process.env.MC_USER || 'POLLOVIS',
    MC_AUTH_PASS: process.env.MC_AUTH_PASS
}