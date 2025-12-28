const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

console.log('--- INICIANDO PROTOCOLO FINAL POLLOVIS ---')

// 1. WEB SERVER (Puerto 8080)
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot Pollovis: ONLINE v3.0')
})
webServer.listen(8080, '0.0.0.0', () => console.log('✅ Web Server OK (8080)'))

// 2. IA
let model = null
try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
} catch (e) { console.error('❌ Error IA:', e) }

// 3. BOT
function initBot() {
  console.log(`🔄 Conectando...`)

  const bot = mineflayer.createBot({
    host: process.env.MC_HOST,
    port: parseInt(process.env.MC_PORT) || 25565,
    username: process.env.MC_USER,
    version: '1.21.4',
    auth: 'offline',
    checkTimeoutInterval: 60000 
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    console.log(`🚀 ${bot.username} conectado.`)
    bot.chat(`/login ${process.env.MC_AUTH_PASS}`)
    
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        defaultMove.canDig = true
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) {}
  })

  // --- FUNCIÓN CENTRAL DE PROCESAMIENTO ---
  async function procesarMensaje(usuario, mensaje, fuente) {
    if (!model) return
    if (usuario === bot.username) return

    // FILTRO DE SEGURIDAD (Flexible)
    // Aceptamos "SrLeonardo", "[Dueño] SrLeonardo", etc.
    if (!usuario.includes('SrLeonardo')) {
        // Solo logueamos para no spamear consola
        // console.log(`Ignorado: ${usuario} (No es el jefe)`)
        return 
    }

    // DETECTAR INTENCIÓN
    const mencionaBot = mensaje.toLowerCase().includes('pollo') || mensaje.toLowerCase().includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    // REGLA: Respondemos si nos mencionan O si es un mensaje privado
    if (mencionaBot || esPrivado) {
        console.log(`⚡ PROCESANDO (${fuente}) de ${usuario}: "${mensaje}"`)
        
        // Contexto
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let playerInfo = target ? `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "No te veo visualmente."

        const prompt = `
          Eres POLLOVIS, asistente de SrLeonardo.
          Usuario: ${usuario}. Mensaje: "${mensaje}".
          Tu pos: ${botPos}. Info visual dueño: ${playerInfo}.
          
          INSTRUCCIONES:
          1. Obedece a SrLeonardo.
          2. Si pide moverse ("ven", "sigueme"), usa #GOTO x y z.
          3. Responde corto y servicial.
        `

        try {
            const result = await model.generateContent(prompt)
            const response = result.response.text()
            console.log(`💬 Gemini: ${response}`)

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
        } catch (e) { console.error("Error API:", e) }
    }
  }

  // --- EVENTO 1: CHAT NORMAL (Mejor detección de usuario) ---
  bot.on('chat', (username, message) => {
    procesarMensaje(username, message, 'chat')
  })

  // --- EVENTO 2: SUSURROS (Whisper) ---
  bot.on('whisper', (username, message) => {
    procesarMensaje(username, message, 'whisper')
  })

  // --- EVENTO 3: RESPALDO NUCLEAR (Messagestr) ---
  // Solo se activa si detecta el formato de mensaje privado de consola o plugins raros
  bot.on('messagestr', (msg) => {
    // Detectar formato AuthMe/Essentials tipo "[SrLeonardo -> me] hola"
    if (msg.includes('-> me') && msg.includes('SrLeonardo')) {
        // Limpieza manual rápida
        const contenido = msg.split(']')[1] || msg // Intenta sacar lo que va después del ]
        procesarMensaje('SrLeonardo', contenido.trim(), 'messagestr_privado')
    }
    // Detectar formato chat publico raro que contenga el nombre explicitamente
    else if (msg.includes('SrLeonardo') && (msg.includes('Pollo') || msg.includes('pollo'))) {
        // Intentamos no duplicar si ya saltó el evento 'chat'
        // (Mineflayer suele disparar 'chat' antes, así que esto es solo por si acaso)
    }
  })

  bot.on('error', (e) => console.log('Error:', e))
  bot.on('end', () => {
    console.log('Desconectado. Reintentando...')
    setTimeout(initBot, 10000)
  })
}

initBot()