require('dotenv').config()

module.exports = {
    MODELO_A_USAR: 'gemini-2.0-flash-lite-preview-02-05',
    MAX_HISTORY: 15,
    MC_HOST: process.env.MC_HOST,
    MC_PORT: parseInt(process.env.MC_PORT) || 25565,
    MC_USER: process.env.MC_USER || 'POLLOVIS',
    MC_AUTH_PASS: process.env.MC_AUTH_PASS,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
}