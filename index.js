const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

console.log('--- INICIANDO SCRIPT NUCLEAR DEL BOT ---')

// --- 1. SERVIDOR WEB (Puerto 8080) ---
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: ONLINE (Modo Escucha Total).')
})

webServer.listen(8080, '0.0.0.0', () => {
  console.log('✅ Servidor web escuchando en puerto 8080')
})

// --- 2. IA ---
let model = null
try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
} catch (err) {
    console.error('❌ Error configurando IA:', err)
}

// --- 3. BOT ---
function initBot() {
  console.log(`🔄 Conectando a ${process.env.MC_HOST}...`)

  const bot = mineflayer.createBot({
    host: process.env.MC_HOST,
    port: parseInt(process.env.MC_PORT) || 25565,
    username: process.env.MC_USER || 'POLLOVIS',
    version: '1.21.4',
    auth: 'offline',
    checkTimeoutInterval: 60000 
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    console.log(`🚀 ¡${bot.username} ha entrado!`)
    const pass = process.env.MC_AUTH_PASS || 'PolloSeguro123'
    bot.chat(`/login ${pass}`)
    
    // Física
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        defaultMove.canDig = true
        defaultMove.allow1by1towers = false 
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) { console.error('Error físicas:', e) }
  })

  // --- CEREBRO MODO "ESCUCHA TOTAL" ---
  // Usamos 'messagestr' en lugar de 'chat' para ignorar formatos de plugins
  bot.on('messagestr', async (messageString, messagePosition, jsonMsg) => {
    
    // 1. Evitar que el bot se escuche a sí mismo
    if (messageString.includes(bot.username) && messageString.includes('dice:')) return; // Filtro básico de auto-eco
    
    // LOGUEAR TODO LO QUE OYE (Para que veas en Easypanel qué pasa)
    console.log(`[OIDO]: ${messageString}`)

    // 2. FILTRO DE DUEÑO (Busca "SrLeonardo" en cualquier parte de la frase)
    if (!messageString.includes('SrLeonardo')) return

    // 3. ACTIVADOR (Alguien dijo su nombre)
    if (messageString.toLowerCase().includes('pollo') || messageString.toLowerCase().includes(bot.username.toLowerCase())) {
        
        console.log('⚡ ¡ORDEN DETECTADA! Procesando con IA...')

        if (!model) return

        // Contexto físico
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
        
        // Intentar buscar al dueño visualmente (esto puede fallar si el nombre en tablist es diferente, pero no importa tanto)
        // Buscamos cualquier entidad jugadora cerca
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let playerInfo = target ? `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "No te veo visualmente."

        const prompt = `
          Eres POLLOVIS en Minecraft.
          Chat escuchado: "${messageString}".
          Tu posición: ${botPos}.
          Info visual de SrLeonardo: ${playerInfo}.
          
          INSTRUCCIONES:
          1. Responde a SrLeonardo como su mayordomo leal.
          2. Si dice "ven", "aquí" o "sigueme" y tienes sus coordenadas visuales, ve hacia él.
          3. IMPORTANTE: Si te vas a mover, termina tu frase con: #GOTO x y z
          4. Responde corto.
        `

        try {
            const result = await model.generateContent(prompt)
            const response = result.response.text()
            console.log(`💬 Gemini Responde: ${response}`)

            if (response.includes('#GOTO')) {
                const match = response.match(/#GOTO\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    const chatMsg = response.replace(/#GOTO.*/, '').trim()
                    if(chatMsg) bot.chat(chatMsg)
                    bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
                }
            } else {
                bot.chat(response)
            }
        } catch (e) {
            console.error("Error Gemini:", e)
        }
    }
  })

  bot.on('kicked', (r) => console.log('⚠️ Expulsado:', r))
  bot.on('error', (err) => console.log('❌ Error conexión:', err))
  
  bot.on('end', () => {
    console.log('🔴 Desconectado. Reconectando en 15s...')
    setTimeout(initBot, 15000)
  })
}

initBot()