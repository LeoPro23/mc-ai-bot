require('dotenv').config()

module.exports = {
    // Configuración OLLAMA (Local/Easypanel)
    USE_OLLAMA: process.env.USE_OLLAMA === 'true' || true, // Por defecto activado
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://software_ollama:11434', // URL interna en Easypanel
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'phi3', // Modelo a usar (asegúrate de descargarlo)

    // Configuración Legacy (Google)
    MODELO_A_USAR: 'gemini-2.0-flash-lite-preview-02-05',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,

    // Configuración Minecraft
    MAX_HISTORY: 15,
    MC_HOST: process.env.MC_HOST,
    MC_PORT: parseInt(process.env.MC_PORT) || 25565,
    MC_USER: process.env.MC_USER || 'POLLOVIS',
    MC_AUTH_PASS: process.env.MC_AUTH_PASS
}