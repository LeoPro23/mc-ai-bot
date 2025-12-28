// index.js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

// --- 1. SERVIDOR WEB "INMORTAL" PARA EASYPANEL ---
// Este servidor mantiene el contenedor vivo (Verde) aunque el bot se desconecte.
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: SISTEMA ONLINE. (Si no esta en el juego, revisa los logs)')
})
webServer.listen(3000, () => console.log('✅ Sistema de salud web iniciado en puerto 3000'))

// --- 2. CONFIGURACIÓN GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// --- 3. FUNCIÓN PRINCIPAL DEL BOT (RECONEXIÓN) ---
function initBot() {
  console.log('🔄 Iniciando conexión con Minecraft...')

  const bot = mineflayer.createBot({
    host: process.env.MC_HOST,
    port: parseInt(process.env.MC_PORT) || 25565,
    username: process.env.MC_USER || 'POLLOVIS',
    version: '1.21.4',
    auth: 'offline',
    checkTimeoutInterval: 60000 
  })

  bot.loadPlugin(pathfinder)

  // --- EVENTOS DEL JUEGO ---
  bot.once('spawn', () => {
    console.log(`🚀 ¡${bot.username} ha entrado al servidor!`)
    
    // Login automático
    const pass = process.env.MC_AUTH_PASS || 'PolloSeguro123'
    bot.chat(`/login ${pass}`)
    
    // Configurar física
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData)
    defaultMove.canDig = true
    defaultMove.allow1by1towers = false 
    bot.pathfinder.setMovements(defaultMove)
  })

  // Cerebro IA
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return
    if (username !== 'SrLeonardo') return // Solo obedece al dueño

    if (message.toLowerCase().includes('pollo') || message.toLowerCase().includes(bot.username.toLowerCase())) {
      const p = bot.entity.position
      const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
      
      const target = bot.players[username] ? bot.players[username].entity : null
      let playerInfo = target ? `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "No te veo visualmente."

      const prompt = `Eres POLLOVIS, mayordomo de SrLeonardo. Tu pos: ${botPos}. Info visual dueño: ${playerInfo}. Mensaje: "${message}". INSTRUCCIONES: Obedece a SrLeonardo. Si dice "ven", usa sus coordenadas visuales. Para moverte termina con: #GOTO x y z. Responde corto.`

      try {
        const result = await model.generateContent(prompt)
        const response = result.response.text()
        console.log(`💬 POLLOVIS: ${response}`)

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
        console.error("❌ Error Gemini:", e)
      }
    }
  })

  // --- MANEJO DE ERRORES Y RECONEXIÓN ---
  bot.on('kicked', (reason) => console.log('⚠️ Fui expulsado:', reason))
  bot.on('error', (err) => console.log('❌ Error de conexión:', err))
  
  bot.on('end', () => {
    console.log('🔴 Bot desconectado. Reintentando en 10 segundos...')
    // Esperamos 10 segundos y volvemos a llamar a initBot()
    setTimeout(initBot, 10000)
  })
}

// Iniciar el bot por primera vez
initBot()