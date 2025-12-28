const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

// --- SERVIDOR WEB PARA EASYPANEL (Mantiene el estado Verde) ---
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: ONLINE. Estado: Logueado y esperando ordenes.')
})
webServer.listen(3000, () => console.log('Webserver salud iniciado en puerto 3000'))

// --- CONFIGURACIÓN GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// --- CONFIGURACIÓN DEL BOT ---
const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER || 'POLLOVIS',
  version: '1.21.4',
  auth: 'offline', // <--- IMPORTANTE: Evita errores de sesión de Microsoft
  checkTimeoutInterval: 60000 // Aumenta tolerancia al lag
})

bot.loadPlugin(pathfinder)

// --- RUTINA DE INICIO Y LOGIN ---
bot.once('spawn', async () => {
  console.log(`¡${bot.username} ha entrado! Iniciando protocolo de login...`)
  
  const pass = process.env.MC_AUTH_PASS
  
  // Intenta ambas cosas (el server ignorará la que no sirva)
  bot.chat(`/login ${pass}`)
  await bot.waitForTicks(20) // Espera 1 segundo
  bot.chat(`/register ${pass} ${pass}`)
  
  console.log('Comandos de autenticación enviados.')

  // Configurar movimientos después de loguearse
  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  defaultMove.canDig = true
  defaultMove.allow1by1towers = false 
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // FILTRO: Solo obedece a SrLeonardo
  if (username !== 'SrLeonardo') return

  if (message.toLowerCase().includes('pollo') || message.toLowerCase().includes(bot.username.toLowerCase())) {
    
    const p = bot.entity.position
    const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`

    // Visión del dueño
    const target = bot.players[username] ? bot.players[username].entity : null
    let playerInfo = "No te veo visualmente."
    if (target) {
        playerInfo = `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}`
    }

    const prompt = `
      Eres POLLOVIS, asistente de SrLeonardo.
      Posición: ${botPos}. Info visual dueño: ${playerInfo}.
      Mensaje de SrLeonardo: "${message}"
      
      INSTRUCCIONES:
      1. Obedece SOLO a SrLeonardo.
      2. Si pide "ven" o "sigueme", usa sus coordenadas visuales.
      3. Para moverte termina con: #GOTO x y z
      4. Responde corto.
    `

    try {
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      console.log(`POLLOVIS dice: ${response}`)

      if (response.includes('#GOTO')) {
        const match = response.match(/#GOTO\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/)
        if (match) {
          const x = parseInt(match[1])
          const y = parseInt(match[2])
          const z = parseInt(match[3])
          
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

bot.on('kicked', (reason) => console.log('Fui expulsado por:', reason))
bot.on('error', (err) => console.log('Error:', err))