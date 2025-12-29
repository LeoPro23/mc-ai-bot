const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const toolPlugin = require('mineflayer-tool').plugin
const pvp = require('mineflayer-pvp').plugin
const { MC_HOST, MC_PORT, MC_USER, MC_AUTH_PASS, MAX_HISTORY } = require('./src/config')
const { startWebServer } = require('./src/web')
const { escanearEntorno } = require('./src/vision')
const { irYRomper, atacarEntidad, construirBloque, construirEstructura, stopBuilding, construirCamino, escanearEstructura, clonarEstructura } = require('./src/actions')
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
  bot.loadPlugin(pvp)

  bot.once('spawn', () => {
    log(`🚀 ${bot.username} conectado.`)
    if (MC_AUTH_PASS) bot.chat(`/login ${MC_AUTH_PASS}`)
    
    // Configuración de Pathfinder
    bot.pathfinder.thinkTimeout = 5000 // Más tiempo para pensar caminos complejos
    bot.pathfinder.tickTimeout = 100
    
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        
        // MANTENEMOS ESTO PARA QUE CAMINE SIN ROMPER TU CASA
        defaultMove.canDig = false 
        defaultMove.allow1by1towers = false 
        defaultMove.allowParkour = true 
        defaultMove.canOpenDoors = true
        defaultMove.canOpenGates = true
        defaultMove.allowSprinting = true
        
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) {}
  })

  // DIAGNÓSTICO DE PATHFINDER
  bot.on('path_update', (r) => {
    if (r.status === 'noPath') {
        if (bot.pathfinder.goal) {
            const msg = "No encuentro camino para llegar ahí."
            bot.chat(msg)
            chatHistory.push(`Pollovis: ${msg}`)
            if (chatHistory.length > MAX_HISTORY) chatHistory.shift()
        }
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
        bot.pvp.stop()
        stopBuilding()
        bot.chat("Me detengo.")
        return
    }

    const mencionaBot = msgLower.includes('pollo') || msgLower.includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    if (mencionaBot || esPrivado) {
        log(`⚡ PROCESANDO de ${usuario}: "${mensaje}"`)
        
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)},y:${Math.floor(p.y)},z:${Math.floor(p.z)}`
        
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let infoDueño = target ? `Dueño en:x:${Math.floor(target.position.x)},y:${Math.floor(target.position.y)},z:${Math.floor(target.position.z)}` : "Dueño:?"
        
        const entorno = escanearEntorno(bot)

        chatHistory.push(`SrLeonardo: ${mensaje}`)
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift()

        const prompt = `ESTADO ACTUAL:
- Mi Posición: ${botPos}
- ${infoDueño}
- Visión: ${entorno}
- Historial reciente: ${chatHistory.join(' | ')}

MENSAJE DE SRLEONARDO: "${mensaje}"`

        try {
            const response = await generateResponse(prompt)
            log(`💬 IA: ${response}`)

            // 1. Extraer y limpiar el mensaje de texto (sin comandos #)
            const textoLimpio = response.replace(/#\w+.*?(\s|$)/g, '').trim()
            if (textoLimpio) {
                bot.chat(textoLimpio.replace(/\n/g, ' '))
                chatHistory.push(`Pollovis: ${textoLimpio}`)
            }

            // 2. Ejecutar Comandos (pueden ser varios)
            
            // #GOTO
            if (response.includes('#GOTO')) {
                const match = response.match(/#GOTO\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1))
                }
            } 
            
            // #MINE
            if (response.includes('#MINE')) {
                const match = response.match(/#MINE\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    irYRomper(bot, x, y, z)
                }
            }

            // #KILL
            if (response.includes('#KILL')) {
                const match = response.match(/#KILL\s+(\w+)/i)
                if (match) {
                    atacarEntidad(bot, match[1])
                }
            }

            // #BUILD
            if (response.includes('#BUILD')) {
                const match = response.match(/#BUILD\s+(\w+)\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const tipo = match[1], x = parseInt(match[2]), y = parseInt(match[3]), z = parseInt(match[4])
                    construirBloque(bot, tipo, x, y, z)
                }
            }

            // #HOUSE
            if (response.includes('#HOUSE')) {
                const p = bot.entity.position
                construirEstructura(bot, 'casa', Math.floor(p.x) + 1, Math.floor(p.y), Math.floor(p.z) + 1)
            }

            // #PATH
            if (response.includes('#PATH')) {
                const match = response.match(/#PATH\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\w+)/i)
                if (match) {
                    const x1 = parseInt(match[1]), y1 = parseInt(match[2]), z1 = parseInt(match[3])
                    const x2 = parseInt(match[4]), y2 = parseInt(match[5]), z2 = parseInt(match[6])
                    const tipo = match[7]
                    construirCamino(bot, x1, y1, z1, x2, y2, z2, tipo)
                }
            }

            // #SCAN
            if (response.includes('#SCAN')) {
                escanearEstructura(bot, 5)
            }

            // #CLONE
            if (response.includes('#CLONE')) {
                clonarEstructura(bot)
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
  
  // AUTO-COMER
  bot.on('health', () => {
    if (bot.food < 15) {
        const food = bot.inventory.items().find(item => {
            const data = require('minecraft-data')(bot.version).foodsByName[item.name]
            return data !== undefined
        })
        if (food) {
            bot.equip(food, 'hand')
            bot.consume()
        }
    }
  })

  bot.on('end', () => {
    log('Desconectado. Reconectando...')
    setTimeout(initBot, 10000)
  })
}

initBot()