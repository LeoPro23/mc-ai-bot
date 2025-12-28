const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

// --- SERVIDOR WEB PARA EASYPANEL (Para que se mantenga en VERDE) ---
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: ONLINE. Estado: Esperando ordenes de SrLeonardo.')
})
webServer.listen(3000, () => console.log('Sistema de salud iniciado en puerto 3000'))

// --- CONFIGURACIÓN GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// --- CONFIGURACIÓN DEL BOT ---
const bot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER || 'POLLOVIS',
  version: '1.21.4',
  auth: 'offline', // Necesario para servidores no-premium o bots
  checkTimeoutInterval: 60000 
})

bot.loadPlugin(pathfinder)

// --- SOLO LOGIN (YA REGISTRADO) ---
bot.once('spawn', () => {
  console.log(`¡${bot.username} ha entrado! Logueándose...`)
  
  // Usa la variable de entorno o la contraseña por defecto que definiste
  const pass = process.env.MC_AUTH_PASS
  
  bot.chat(`/login ${pass}`)
  
  console.log('Login enviado. Configurando movimientos...')

  // Configurar física del bot
  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  defaultMove.canDig = true
  defaultMove.allow1by1towers = false 
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // SEGURIDAD: Solo obedece a SrLeonardo
  if (username !== 'SrLeonardo') return

  if (message.toLowerCase().includes('pollo') || message.toLowerCase().includes(bot.username.toLowerCase())) {
    
    // Datos espaciales
    const p = bot.entity.position
    const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`

    // ¿Dónde está el jefe?
    const target = bot.players[username] ? bot.players[username].entity : null
    let playerInfo = "No te veo visualmente (fuera de rango)."
    
    if (target) {
        playerInfo = `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}`
    }

    const prompt = `
      Eres POLLOVIS, el mayordomo de SrLeonardo.
      Tu ubicación: ${botPos}.
      Ubicación visual de SrLeonardo: ${playerInfo}.
      Mensaje recibido: "${message}"
      
      INSTRUCCIONES:
      1. Obedece SOLO a SrLeonardo.
      2. Si dice "ven", "aquí" o "sígueme", usa sus coordenadas visuales.
      3. IMPORTANTE: Para moverte, termina tu respuesta con: #GOTO x y z
      4. Si no tienes coordenadas visuales, pídeselas.
      5. Responde brevemente.
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
        } else {
             bot.chat(response)
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
bot.on('end', () => console.log('Desconectado.'))