const { GoogleGenerativeAI } = require('@google/generative-ai')
const { MODELO_A_USAR, GEMINI_API_KEY } = require('./config')

let model = null

function initAI() {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    try {
        model = genAI.getGenerativeModel({ model: MODELO_A_USAR })
        console.log(`✅ IA Lista: ${MODELO_A_USAR}`)
    } catch (e) { console.error('❌ Error IA:', e) }
}

async function generateResponse(prompt) {
    if (!model) throw new Error("IA no inicializada")
    const result = await model.generateContent(prompt)
    return result.response.text()
}

module.exports = { initAI, generateResponse }