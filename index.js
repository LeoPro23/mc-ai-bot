const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { OpenAI } = require('openai')

// Configuración del Bot
const bot = mineflayer.createBot({
  host: process.env.MC_HOST || 'host.docker.internal', 
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER || 'POLLOVIS_AI',
  version: '1.21'
})

// Configuración de IA
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
  // baseURL: 'https://api.deepseek.com' // Descomenta si usas DeepSeek
})

bot.loadPlugin(pathfinder)

bot.on('spawn', () => {
  console.log('¡POLLOVIS ha aterrizado en el servidor!')
  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  
  // Si le hablan al bot
  if (message.toLowerCase().includes(bot.username.toLowerCase())) {
    const prompt = `Eres un asistente en Minecraft llamado POLLOVIS. 
    El jugador ${username} te dijo: "${message}".
    Responde corto. Si te piden ir a un lugar, responde SOLO con: #GOTO x y z`

    try {
      const completion = await openai.chat.completions.create({
        messages: [{ role: 'system', content: prompt }],
        model: 'gpt-3.5-turbo', // O el modelo que prefieras
      })

      const reply = completion.choices[0].message.content
      
      // Lógica simple de comandos
      if (reply.includes('#GOTO')) {
        const args = reply.split(' ')
        const x = parseFloat(args[1])
        const y = parseFloat(args[2])
        const z = parseFloat(args[3])
        bot.chat(`Entendido, voy a ${x} ${y} ${z}`)
        bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
      } else {
        bot.chat(reply)
      }
    } catch (e) {
      console.error(e)
    }
  }
})

bot.on('kicked', console.log)
bot.on('error', console.log)