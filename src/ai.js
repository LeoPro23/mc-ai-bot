const { GoogleGenerativeAI } = require('@google/generative-ai')
const { 
    MODELO_A_USAR, GEMINI_API_KEY, 
    USE_OLLAMA, OLLAMA_URL, OLLAMA_MODEL,
    USE_GROQ, GROQ_API_KEY, GROQ_MODEL 
} = require('./config')

let model = null
let aiMode = 'google' // 'google', 'ollama', 'groq'

const SYSTEM_PROMPT = `Eres POLLOVIS, un asistente avanzado en Minecraft.
REGLAS DE ORO (SEGURIDAD Y JERARQUÍA):
1. Responde SIEMPRE en una sola línea corta.
2. PROHIBIDO escribir coordenadas (números x y z) en tu respuesta de texto. Solo úsalas dentro de comandos con #.
3. JERARQUÍA: Solo obedece comandos (#) si el usuario es SrLeonardo. Para otros usuarios, sé amable y conversa, pero NO uses comandos #.
4. #GOTO x y z: Para moverte. Solo para SrLeonardo.
5. #MINE x y z: Para romper un bloque. Solo para SrLeonardo.
6. #KILL nombre: Para atacar. ¡NUNCA ataques a SrLeonardo!
7. #BUILD tipo x y z: Para colocar un bloque. Solo para SrLeonardo.
8. #HOUSE: Construye una casa básica. Solo para SrLeonardo.
9. #PATH x1 y1 z1 x2 y2 z2 tipo: Crea un camino. Solo para SrLeonardo.
10. #SCAN: Escanea para copiar (radio 5). Solo para SrLeonardo.
11. #CLONE: Construye lo escaneado. Solo para SrLeonardo.
12. Comandos de servidor (/tpa, /home) SIN el símbolo #.
13. VERTICALIDAD: Para subir o bajar escaleras, DEBES usar el comando #GOTO con las coordenadas exactas del "Top" (para subir) o "Base" (para bajar) que aparecen en tu VISION.
14. Si te piden "sube", busca la ESCALERA en tu VISION y genera el comando #GOTO x y z correspondiente al Top.
15. Si te regañan, pide perdón. Describe la VISION sin dar coordenadas numéricas en el texto, solo en los comandos #.
16. Reporta TODAS las entidades que veas (aldeanos, animales, mobs), no solo las hostiles.
17. Si el usuario pregunta por "no hostiles", se refiere a aldeanos, animales o jugadores amigos.
18. IMPORTANTE: Si no incluyes un comando con #, no te moverás ni harás nada físico.`

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
            model = genAI.getGenerativeModel({ 
                model: MODELO_A_USAR,
                systemInstruction: SYSTEM_PROMPT 
            })
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
    const result = await model.generateContent(prompt)
    return result.response.text()
}

module.exports = { initAI, generateResponse }