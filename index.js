const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const toolPlugin = require('mineflayer-tool').plugin
const { MC_HOST, MC_PORT, MC_USER, MC_AUTH_PASS, MAX_HISTORY } = require('./src/config')
const { startWebServer } = require('./src/web')
const { escanearEntorno } = require('./src/vision')
const { irYRomper } = require('./src/actions')
const { initAI, generateResponse } = require('./src/ai')

// Función para logs con hora
function log(msg) {
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false })
    console.log(`[${time}] ${msg}`)
}

log('--- INICIANDO SISTEMA POLLOVIS 5.2 (MODULAR) ---')

// Historial de conversación
const chatHistory = []

// Iniciar servidor web
startWebServer()

// Iniciar IA
initAI()

function initBot() {
  log(`🔄 Conectando...`)

  const bot = mineflayer.createBot({
    host: MC_HOST,
    port: MC_PORT,
    username: MC_USER,
    version: '1.21.4',
    auth: 'offline',
    checkTimeoutInterval: 60000 
  })

  // CARGAR PLUGINS
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(toolPlugin)

  bot.once('spawn', () => {
    log(`🚀 ${bot.username} conectado.`)
    if (MC_AUTH_PASS) bot.chat(`/login ${MC_AUTH_PASS}`)
    
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        
        // MANTENEMOS ESTO PARA QUE CAMINE SIN ROMPER TU CASA
        defaultMove.canDig = false 
        defaultMove.allow1by1towers = false 
        defaultMove.allowParkour = true 
        defaultMove.canOpenDoors = true
        defaultMove.canOpenGates = true
        
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) {}
  })

  // DIAGNÓSTICO DE PATHFINDER
  bot.on('path_update', (r) => {
    if (r.status === 'noPath') {
        bot.chat("No encuentro camino para llegar ahí.")
    }
  })

  async function procesarMensaje(usuario, mensaje, fuente) {
    if (usuario === bot.username) return
    
    // FILTRO ESTRICTO: Solo SrLeonardo
    if (!usuario.includes('SrLeonardo')) return 

    // COMANDO DE EMERGENCIA
    const msgLower = mensaje.toLowerCase()
    if (msgLower === 'para' || msgLower === 'stop' || msgLower === 'quieto') {
        bot.pathfinder.setGoal(null)
        bot.stopDigging()
        bot.chat("Me detengo.")
        return
    }

    const mencionaBot = msgLower.includes('pollo') || msgLower.includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    if (mencionaBot || esPrivado) {
        log(`⚡ PROCESANDO de ${usuario}: "${mensaje}"`)
        
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
        
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let infoDueño = target ? `Dueño en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "Dueño lejos/oculto."
        
        const entorno = escanearEntorno(bot)

        chatHistory.push(`SrLeonardo: ${mensaje}`)
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift()

        const prompt = `Pos:${botPos}. ${infoDueño}. Cerca:${entorno}. Historial:${chatHistory.join(' | ')}. Mensaje:${mensaje}. Respuesta:`

        try {
            const response = await generateResponse(prompt)
            log(`💬 IA: ${response}`)

            chatHistory.push(`Pollovis: ${response.replace(/#.*/, '').trim()}`)

            // Lógica de Comandos
            if (response.includes('#GOTO')) {
                const match = response.match(/#GOTO\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    const chatMsg = response.replace(/#GOTO.*/, '').trim()
                    if(chatMsg) bot.chat(chatMsg.replace(/\n/g, ' '))
                    bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
                }
            } 
            else if (response.includes('#MINE')) {
                const match = response.match(/#MINE\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    const chatMsg = response.replace(/#MINE.*/, '').trim()
                    if(chatMsg) bot.chat(chatMsg.replace(/\n/g, ' '))
                    irYRomper(bot, x, y, z)
                }
            }
            else {
                bot.chat(response.replace(/\n/g, ' | '))
            }
        } catch (e) { 
            log(`❌ Error API: ${e.message}`)
            bot.chat("Error cerebral.")
        }
    }
  }

  // EVENTOS
  bot.on('chat', (u, m) => procesarMensaje(u, m, 'chat'))
  bot.on('whisper', (u, m) => procesarMensaje(u, m, 'whisper'))
  bot.on('messagestr', (msg) => {
    if (msg.includes('-> me') && msg.includes('SrLeonardo')) {
        const contenido = msg.split(']')[1] || msg 
        procesarMensaje('SrLeonardo', contenido.trim(), 'messagestr_privado')
    }
  })

  bot.on('error', (e) => log(`Error: ${e}`))
  bot.on('end', () => {
    log('Desconectado. Reconectando...')
    setTimeout(initBot, 10000)
  })
}

initBot()