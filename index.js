const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')

console.log('--- INICIANDO SISTEMA POLLOVIS 3.0 ---')

// --- 1. CONFIGURACIÓN DEL MODELO ---
// Según tu texto, el ID es 'gemini-3-flash-preview', pero si no tienes acceso
// usaremos 'gemini-1.5-flash' que es la versión estable actual.
const MODELO_A_USAR = 'gemini-3-flash-preview' 
// const MODELO_A_USAR = 'gemini-3-flash-preview' // DESCOMENTAR SI TIENES ACCESO BETA

// --- 2. SERVIDOR WEB (Puerto 8080) ---
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`Bot Pollovis ONLINE. Modelo: ${MODELO_A_USAR}`)
})
webServer.listen(8080, '0.0.0.0', () => console.log('✅ Web Server OK (8080)'))

// --- 3. INICIALIZACIÓN IA CON DIAGNÓSTICO ---
let model = null
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

async function configurarIA() {
    try {
        // Diagnóstico: Listar modelos disponibles para tu API KEY
        // Esto nos dirá si realmente tienes acceso a la 1.5 o la 3.0
        /* Nota: Si el código falla aquí con 404, es posible que tu API Key 
           no tenga la API "Generative Language" habilitada en Google Cloud.
        */
        model = genAI.getGenerativeModel({ model: MODELO_A_USAR })
        console.log(`✅ IA Configurada usando modelo: ${MODELO_A_USAR}`)
    } catch (e) {
        console.error('❌ Error CRÍTICO configurando IA:', e)
    }
}
configurarIA()

// --- 4. BOT MINECRAFT ---
function initBot() {
  console.log(`🔄 Conectando a ${process.env.MC_HOST}...`)

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
    console.log(`🚀 ${bot.username} conectado al juego.`)
    bot.chat(`/login ${process.env.MC_AUTH_PASS}`)
    
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        defaultMove.canDig = true
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) {}
  })

  // --- FUNCIÓN DE PROCESAMIENTO INTELIGENTE ---
  async function procesarMensaje(usuario, mensaje, fuente) {
    if (!model) return
    if (usuario === bot.username) return

    // Filtro de dueño flexible
    if (!usuario.includes('SrLeonardo')) return 

    const mencionaBot = mensaje.toLowerCase().includes('pollo') || mensaje.toLowerCase().includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    if (mencionaBot || esPrivado) {
        console.log(`⚡ PROCESANDO (${fuente}) de ${usuario}: "${mensaje}"`)
        
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
        
        // Contexto visual
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let playerInfo = target ? `Te veo en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "No te veo visualmente."

        const prompt = `
          Eres POLLOVIS.
          Usuario: ${usuario}. Mensaje: "${mensaje}".
          Tu pos: ${botPos}. Info visual dueño: ${playerInfo}.
          
          INSTRUCCIONES:
          1. Obedece a SrLeonardo.
          2. Si pide moverse ("ven", "sigueme"), usa #GOTO x y z.
          3. Responde muy corto.
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
            console.error("❌ Error API Gemini:", e.message)
            bot.chat("Error de conexión con mi cerebro.") 
        }
    }
  }

  // EVENTOS
  bot.on('chat', (u, m) => procesarMensaje(u, m, 'chat'))
  bot.on('whisper', (u, m) => procesarMensaje(u, m, 'whisper'))
  
  // Respaldo para mensajes de sistema/plugins
  bot.on('messagestr', (msg) => {
    if (msg.includes('-> me') && msg.includes('SrLeonardo')) {
        const contenido = msg.split(']')[1] || msg 
        procesarMensaje('SrLeonardo', contenido.trim(), 'messagestr_privado')
    }
    else if (msg.includes('SrLeonardo') && (msg.includes('Pollo') || msg.includes('pollo'))) {
        // Opcional: procesarMensaje('SrLeonardo', msg, 'messagestr_publico')
    }
  })

  bot.on('error', (e) => console.log('Error:', e))
  bot.on('end', () => {
    console.log('Desconectado. Reconectando...')
    setTimeout(initBot, 10000)
  })
}

initBot()