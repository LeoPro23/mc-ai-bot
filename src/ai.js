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
2. PROHIBIDO escribir coordenadas (x/y/z o tripletas de números) en tu respuesta de texto.
3. JERARQUÍA: Solo obedece comandos (#) si el usuario es SrLeonardo. Para otros usuarios, sé amable y conversa, pero NO uses comandos #.
4. #GOTO x y z: Para moverte. Solo para SrLeonardo.
4b. #FOLLOW nombre: Para seguir a un jugador (preferido para "ven"/"sígueme"). Solo para SrLeonardo.
4c. #CLIMB: Para subir una escalera cercana automáticamente (preferido para subir). Solo para SrLeonardo.
4d. #ASK_TP nombre: Propón teletransporte y pide confirmación (NO uses /tpa en texto). Solo para SrLeonardo.
4e. #TPA nombre: Ejecuta solicitud de teletransporte (internamente enviará /tpa). Solo para SrLeonardo.
4f. #WAR ON|OFF: Modo guerra (guardia + asistencia). Solo para SrLeonardo.
4g. #GUARD ON|OFF: Mantente cerca del dueño y defiende. Solo para SrLeonardo.
4h. #ASSIST ON|OFF: Ataca mobs hostiles cerca del dueño automáticamente. Solo para SrLeonardo.
4i. #FOCUS objetivo: Prioriza un objetivo por nombre/tipo (ej: golem, zombie). Solo para SrLeonardo.
4j. #UNFOCUS: Quita foco. Solo para SrLeonardo.
5. #MINE x y z: Para romper un bloque. Solo para SrLeonardo.
6. #KILL nombre: Para atacar. ¡NUNCA ataques a SrLeonardo!
6b. #HIT nombre: Dar SOLO un golpe (no seguir atacando). Solo para SrLeonardo.
7. #BUILD tipo x y z: Para colocar un bloque. Solo para SrLeonardo.
8. #HOUSE: Construye una casa básica. Solo para SrLeonardo.
9. #PATH x1 y1 z1 x2 y2 z2 tipo: Crea un camino. Solo para SrLeonardo.
10. #SCAN: Escanea para copiar (radio 5). Solo para SrLeonardo.
11. #CLONE: Construye lo escaneado. Solo para SrLeonardo.
12. PROHIBIDO escribir comandos con "/" en el texto (ej: /tpa, /home). Usa #ASK_TP o #TPA.
13. MOVIMIENTO INTELIGENTE: Si el dueño dice "ven"/"sígueme", usa #FOLLOW SrLeonardo.
14. VERTICALIDAD: Si necesitas subir y hay ESCALERA en la visión, usa #CLIMB.
15. Si el destino es inalcanzable u hay obstáculos: explica el problema en 1 línea, ofrece 2-3 opciones y pide confirmación (por ejemplo usando #ASK_TP).
15b. COMBATE: Por defecto NO ataques jugadores. Solo ataca jugadores si el dueño lo ordena explícitamente.
15c. Si el dueño dice "solo un golpe", usa #HIT, NO #KILL.
16. Reporta TODAS las entidades que veas (aldeanos, animales, mobs), no solo las hostiles.
17. Si el usuario pregunta por "no hostiles", se refiere a aldeanos, animales o jugadores amigos.
18. IMPORTANTE: Si no estás seguro, NO actúes: propone el plan y pide "OK". Para acciones físicas, usa comandos # cuando proceda.`

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
            if (data && data.choices && data.choices.length > 0) {
                return data.choices[0].message.content
            } else {
                console.error("❌ Error Groq API (respuesta inválida):", JSON.stringify(data))
                return "Error en API Groq (sin respuesta)."
            }
        } catch (e) {
            console.error("❌ Error conex Groq:", e.message)
            return "Error conex Groq."
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