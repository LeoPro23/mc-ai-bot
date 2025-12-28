const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http') // Necesario para Easypanel

// --- TRUCO PARA EASYPANEL (Mantiene el bot en verde) ---
// Easypanel necesita detectar que la app está "viva" en un puerto.
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: ONLINE y funcionando')
})
// Easypanel suele usar el puerto 3000 por defecto para chequear salud
webServer.listen(3000, () => {
  console.log('Servidor web de salud iniciado en puerto 3000')
})
// -------------------------------------------------------

// 1. Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// 2. Configuración del Bot
const bot = mineflayer.createBot({
  host: process.env.MC_HOST, // Recuerda: sin http://
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER || 'POLLOVIS',
  version: '1.21.4'
})

bot.loadPlugin(pathfinder)

// Configuración inicial
bot.on('spawn', () => {
  console.log(`¡${bot.username} ha entrado al servidor correctamente!`)
  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  
  defaultMove.canDig = true
  defaultMove.allow1by1towers = false 
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', async (username, message) => {
  // Ignorar mensajes del propio bot
  if (username === bot.username) return

  // --- FILTRO DE DUEÑO ---
  // Solo permite pasar si el usuario es EXACTAMENTE 'SrLeonardo'
  if (username !== 'SrLeonardo') {
    console.log(`Ignorando orden de ${username} (No es el dueño)`)
    return
  }

  // Detectar si mencionan al bot (Opcional, ya que solo el dueño le habla, 
  // pero es bueno mantenerlo por si hablas con otros jugadores en el chat)
  if (message.toLowerCase().includes('pollo') || message.toLowerCase().includes(bot.username.toLowerCase())) {
    
    // Datos de posición
    const p = bot.entity.position
    const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`

    // Buscar al dueño visualmente
    const target = bot.players[username] ? bot.players[username].entity : null
    let playerInfo = "No te veo visualmente (estás lejos o fuera de render)."
    
    if (target) {
        playerInfo = `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}`
    }

    const prompt = `
      Eres POLLOVIS, el asistente personal de SrLeonardo (Rango Dueño) en Minecraft.
      
      CONTEXTO:
      - Tu posición: ${botPos}
      - SrLeonardo te dice: "${message}"
      - Info visual de SrLeonardo: ${playerInfo}
      
      INSTRUCCIONES:
      1. Obedece SOLO a SrLeonardo. Eres extremadamente leal.
      2. Si te pide ir a su lado ("ven", "aquí"), usa sus coordenadas visuales si las tienes.
      3. Para moverte, finaliza tu respuesta con: #GOTO x y z
      4. Si no ves sus coordenadas, pídele que te las diga por chat.
      5. Responde corto y servicial.
    `

    try {
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      console.log(`POLLOVIS responde a SrLeonardo: ${response}`)

      if (response.includes('#GOTO')) {
        const match = response.match(/#GOTO\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/)
        if (match) {
          const x = parseInt(match[1])
          const y = parseInt(match[2])
          const z = parseInt(match[3])
          
          const chatMsg = response.replace(/#GOTO.*/, '').trim()
          if(chatMsg) bot.chat(chatMsg)
          
          bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
        } else {
            bot.chat(response)
        }
      } else {
        bot.chat(response)
      }

    } catch (e) {
      console.error("Error Gemini:", e)
      bot.chat("Jefe, tuve un error mental (API Error).")
    }
  }
})

// Logs importantes para ver errores en Easypanel
bot.on('kicked', (reason) => console.log('Fui expulsado por:', reason))
bot.on('error', (err) => console.log('Error de conexión:', err))
bot.on('end', () => console.log('El bot se desconectó.'))