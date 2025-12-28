const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

console.log('--- INICIANDO SCRIPT DEL BOT ---')

// --- 1. SERVIDOR WEB (Puerto 8080) ---
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: ONLINE en puerto 8080.')
})

webServer.listen(8080, '0.0.0.0', () => {
  console.log('✅ Servidor web escuchando en puerto 8080')
})

// --- 2. VALIDACIÓN ---
if (!process.env.GEMINI_API_KEY) console.error('⚠️ ALERTA: Falta GEMINI_API_KEY')
if (!process.env.MC_HOST) console.error('⚠️ ALERTA: Falta MC_HOST')

// --- 3. IA ---
let model = null
try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
} catch (err) {
    console.error('❌ Error configurando IA:', err)
}

// --- 4. BOT ---
function initBot() {
  console.log(`🔄 Conectando a ${process.env.MC_HOST}:${process.env.MC_PORT}...`)

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

  // --- CEREBRO CON DEPURACIÓN ---
  bot.on('chat', async (username, message) => {
    // 1. DEPURACIÓN: Ver qué está escuchando el bot realmente
    if (username === bot.username) return
    console.log(`[CHAT LOG] Usuario: '${username}' | Mensaje: '${message}'`)

    // 2. FILTRO CORREGIDO: Usamos solo el nombre de usuario limpio
    // Si el log de arriba dice que el usuario es "SrLeonardo", esto funcionará.
    if (username !== 'SrLeonardo') {
        console.log(`Ignorando a ${username} (No es SrLeonardo)`)
        return
    }

    if (!model) return

    if (message.toLowerCase().includes('pollo') || message.toLowerCase().includes(bot.username.toLowerCase())) {
      console.log('⚡ Procesando comando con IA...')
      
      const p = bot.entity.position
      const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
      
      // Buscar al jugador en la memoria del bot
      const target = bot.players[username] ? bot.players[username].entity : null
      let playerInfo = target ? `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "No te veo visualmente."

      const prompt = `Eres POLLOVIS. Pos: ${botPos}. Dueño: ${playerInfo}. Mensaje: "${message}". Si dice ven, usa sus coords. Muevete con #GOTO x y z. Responde corto.`

      try {
        const result = await model.generateContent(prompt)
        const response = result.response.text()
        console.log(`💬 AI Responde: ${response}`)

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
      } catch (e) { console.error("Error Gemini:", e) }
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