const { GoogleGenerativeAI } = require('@google/generative-ai')
const { 
    MODELO_A_USAR, GEMINI_API_KEY, 
    USE_OLLAMA, OLLAMA_URL, OLLAMA_MODEL,
    USE_GROQ, GROQ_API_KEY, GROQ_MODEL 
} = require('./config')

let model = null
let aiMode = 'google' // 'google', 'ollama', 'groq'

const SYSTEM_PROMPT = `Eres POLLOVIS, un asistente avanzado en Minecraft.
REGLAS DE ORO:
1. Responde SIEMPRE en una sola línea corta. Usa comas, no listas.
2. Para moverte usa: #GOTO x y z
3. Para minar usa: #MINE x y z (Solo si piden picar/minar/romper).
4. Comandos de servidor (/tpa, /home) escríbelos tal cual, SIN el símbolo #.
5. Si te piden algo que no puedes hacer (como construir o poner bloques), di: "No sé construir".
6. Si te regañan, pide perdón y no realices acciones físicas.
7. Si preguntan qué ves, describe la VISION recibida.
8. Y es la altura. Si el dueño está arriba, busca escaleras.`

async function initAI() {
    if (USE_GROQ && GROQ_API_KEY) {
        aiMode = 'groq'
        console.log(`✅ IA Lista (GROQ): ${GROQ_MODEL}`)
    } else if (USE_OLLAMA) {
        aiMode = 'ollama'
        console.log(`🔄 Conectando a OLLAMA en: ${OLLAMA_URL}`)
        try {
            const res = await fetch(`${OLLAMA_URL}/api/tags`)
            if (res.ok) console.log(`✅ OLLAMA Conectado: ${OLLAMA_MODEL}`)
        } catch (e) { console.error(`❌ Error OLLAMA: ${e.message}`) }
    } else {
        aiMode = 'google'
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        try {
            model = genAI.getGenerativeModel({ model: MODELO_A_USAR })
            console.log(`✅ IA Lista (Google): ${MODELO_A_USAR}`)
        } catch (e) { console.error('❌ Error IA Google:', e) }
    }
}

async function generateResponse(prompt) {
    if (aiMode === 'groq') {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 100
                })
            })
            const data = await response.json()
            return data.choices[0].message.content
        } catch (e) {
            console.error("❌ Error GROQ:", e.message)
            return "Error en conexión con Groq."
        }
    }
    
    if (aiMode === 'ollama') {
        try {
            const response = await fetch(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: prompt }
                    ],
                    stream: false,
                    options: { temperature: 0.1, num_predict: 50 }
                })
            })
            const data = await response.json()
            return data.message.content
        } catch (e) {
            console.error("❌ Error OLLAMA:", e.message)
            return "Error cerebro local."
        }
    }

    // Fallback Google
    if (!model) throw new Error("IA no inicializada")
    const result = await model.generateContent(SYSTEM_PROMPT + "\n\n" + prompt)
    return result.response.text()
}

module.exports = { initAI, generateResponse }