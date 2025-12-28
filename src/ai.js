const { GoogleGenerativeAI } = require('@google/generative-ai')
const { MODELO_A_USAR, GEMINI_API_KEY, USE_OLLAMA, OLLAMA_URL, OLLAMA_MODEL } = require('./config')

let model = null
let isOllama = false

async function initAI() {
    if (USE_OLLAMA) {
        console.log(`🔄 Conectando a OLLAMA en: ${OLLAMA_URL}`)
        isOllama = true
        try {
            // Verificar conexión simple
            const res = await fetch(`${OLLAMA_URL}/api/tags`)
            if (res.ok) {
                console.log(`✅ OLLAMA Conectado. Modelo seleccionado: ${OLLAMA_MODEL}`)
            } else {
                console.error(`⚠️ OLLAMA responde pero con error: ${res.status}`)
            }
        } catch (e) {
            console.error(`❌ Error conectando a OLLAMA: ${e.message}`)
            console.log("💡 Asegúrate de que el servicio 'ollama' está corriendo y en la misma red.")
        }
    } else {
        // Fallback a Google Gemini
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        try {
            model = genAI.getGenerativeModel({ model: MODELO_A_USAR })
            console.log(`✅ IA Lista (Google): ${MODELO_A_USAR}`)
        } catch (e) { console.error('❌ Error IA Google:', e) }
    }
}

async function generateResponse(prompt) {
    if (isOllama) {
        try {
            const response = await fetch(`${OLLAMA_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    prompt: prompt,
                    stream: false, // Importante: respuesta completa de una vez
                    options: {
                        temperature: 0.1, // Más preciso para comandos
                        num_predict: 150  // Respuestas cortas
                    }
                })
            })
            
            const data = await response.json()
            if (data.error) throw new Error(data.error)
            return data.response
            
        } catch (e) {
            console.error("❌ Error OLLAMA:", e.message)
            return "Error de conexión con mi cerebro local."
        }
    } else {
        // Lógica Google Gemini
        if (!model) throw new Error("IA Google no inicializada")
        const result = await model.generateContent(prompt)
        return result.response.text()
    }
}

module.exports = { initAI, generateResponse }