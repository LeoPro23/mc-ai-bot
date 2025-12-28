const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// 1. Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
// Usamos 'gemini-1.5-flash' porque es más rápido para juegos
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

// 2. Configuración del Bot
const bot = mineflayer.createBot({
  host: process.env.MC_HOST || 'host.docker.internal',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER || 'POLLOVIS',
  version: '1.21.4'
})

bot.loadPlugin(pathfinder)

// Movimientos básicos
bot.on('spawn', () => {
  console.log('¡POLLOVIS ha aterrizado!')
  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  
  // Ajustes para que no se rompa las piernas o se quede atascado
  defaultMove.canDig = true
  defaultMove.allow1by1towers = false 
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // Solo responde si mencionan su nombre para ahorrar recursos
  if (message.toLowerCase().includes(bot.username.toLowerCase()) || message.includes('POLLOVIS')) {
    
    // Obtenemos la posición actual para que el bot tenga contexto
    const p = bot.entity.position
    const myPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`

    const prompt = `
      Actúa como un asistente útil en Minecraft llamado POLLOVIS.
      El jugador ${username} te dijo: "${message}".
      Tu ubicación actual es: ${myPos}.
      
      REGLAS DE RESPUESTA:
      1. Responde de forma breve y con personalidad de mayordomo servicial.
      2. Si te piden ir a unas coordenadas, responde ESTRICTAMENTE con este formato al final: #GOTO x y z
      3. Si te piden venir a donde está el jugador, responde pidiendo sus coordenadas, ya que no puedes verlas por magia.
      4. No uses markdown ni emojis excesivos, usa texto plano de Minecraft.
    `

    try {
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      console.log(`Gemini dice: ${response}`) // Log para depurar en Easypanel

      // Lógica para detectar comandos de movimiento
      if (response.includes('#GOTO')) {
        // Extraemos las coordenadas del texto
        const match = response.match(/#GOTO\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/)
        if (match) {
          const x = parseInt(match[1])
          const y = parseInt(match[2])
          const z = parseInt(match[3])
          
          // Limpiamos el mensaje para el chat (quitamos el comando feo)
          const chatMsg = response.replace(/#GOTO.*/, '').trim()
          if(chatMsg) bot.chat(chatMsg)
          
          bot.chat(`Voy hacia ${x} ${y} ${z}`)
          bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
        } else {
            bot.chat(response)
        }
      } else {
        // Respuesta normal de conversación
        bot.chat(response)
      }

    } catch (e) {
      console.error("Error con Gemini:", e)
      bot.chat("Lo siento señor, me he mareado un poco (Error de API).")
    }
  }
})

bot.on('kicked', console.log)
bot.on('error', console.log)