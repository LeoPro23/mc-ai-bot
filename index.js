const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// 1. Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// 2. Configuración del Bot POLLOVIS
const bot = mineflayer.createBot({
  host: process.env.MC_HOST || 'host.docker.internal',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER || 'POLLOVIS',
  version: '1.21.4' 
})

bot.loadPlugin(pathfinder)

// Movimientos básicos al nacer
bot.on('spawn', () => {
  console.log(`¡${bot.username} ha aterrizado en 1.21.4!`)
  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  
  // Ajustes de movilidad
  defaultMove.canDig = true
  defaultMove.allow1by1towers = false 
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // Detectar si le hablan a POLLOVIS
  if (message.toLowerCase().includes(bot.username.toLowerCase()) || message.toLowerCase().includes('pollo')) {
    
    // --- LÓGICA DE VISIÓN ---
    // Detectamos dónde está el bot
    const p = bot.entity.position
    const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`

    // Detectamos dónde está el JUGADOR que habla (si está cerca)
    const target = bot.players[username] ? bot.players[username].entity : null
    let playerInfo = "No ves al jugador (está muy lejos)."
    
    if (target) {
        playerInfo = `El jugador está visible en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}`
    }

    // --- CEREBRO GEMINI ---
    const prompt = `
      Eres POLLOVIS, un asistente inteligente en Minecraft server 1.21.4.
      
      CONTEXTO ACTUAL:
      - Tu posición: ${botPos}
      - El jugador "${username}" te dice: "${message}"
      - Información visual: ${playerInfo}
      
      REGLAS OBLIGATORIAS:
      1. Tu personalidad: Eres leal, un poco gracioso y eficiente.
      2. COMANDOS DE MOVIMIENTO:
         - Si el jugador te pide ir a su lado ("ven", "sígueme", "aquí estoy"), usa sus coordenadas del contexto visual.
         - Para moverte, DEBES terminar tu frase con: #GOTO x y z
      3. Si el jugador está lejos y no ves sus coordenadas, pídeselas.
      4. Respuestas cortas (máximo 1 oración de texto + el comando).
    `

    try {
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      console.log(`POLLOVIS PENSÓ: ${response}`) 

      // Ejecución de comandos
      if (response.includes('#GOTO')) {
        const match = response.match(/#GOTO\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/)
        if (match) {
          const x = parseInt(match[1])
          const y = parseInt(match[2])
          const z = parseInt(match[3])
          
          // Decir la parte de texto (limpiando el comando técnico)
          const chatMsg = response.replace(/#GOTO.*/, '').trim()
          if(chatMsg) bot.chat(chatMsg)
          
          // Moverse
          bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
        } else {
            bot.chat(response) // Fallo al parsear, solo habla
        }
      } else {
        bot.chat(response)
      }

    } catch (e) {
      console.error("Error Gemini:", e)
    }
  }
})

// Logs de error para depurar en Easypanel
bot.on('kicked', console.log)
bot.on('error', console.log)