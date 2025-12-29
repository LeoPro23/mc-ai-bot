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
    bot.pathfinder.thinkTimeout = 10000 // Aumentado a 10s para rutas difíciles
    bot.pathfinder.tickTimeout = 50
    
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        
        // Configuración EXTREMA para navegación vertical y saltos
        defaultMove.canDig = false // No romper bloques para llegar a la escalera
        defaultMove.allow1by1towers = true 
        defaultMove.allowParkour = true 
        defaultMove.canOpenDoors = true
        defaultMove.canOpenGates = true
        defaultMove.allowSprinting = true
        defaultMove.allowFreeMotion = true 
        defaultMove.jumpCost = 0.05 // Salto casi gratuito
        defaultMove.climbCost = 5 // Prioridad máxima a trepar
        
        // Forzar que las escaleras sean transitables incluso si están un bloque arriba
        const ladderId = mcData.blocksByName.ladder.id
        defaultMove.exclusionAreas = [] 
        
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) {
        log(`❌ Error configurando Movements: ${e.message}`)
    }
  })

  // DIAGNÓSTICO DE PATHFINDER
  bot.on('path_update', (r) => {
    if (r.status === 'noPath') {
        if (bot.pathfinder.goal) {
            log(`⚠️ Pathfinder: No hay ruta clara a ${bot.pathfinder.goal.x}, ${bot.pathfinder.goal.y}, ${bot.pathfinder.goal.z}`)
        }
    }
  })

  async function procesarMensaje(usuario, mensaje, fuente) {
    if (usuario === bot.username) return
    
    const esDueño = usuario.includes('SrLeonardo')
    const msgLower = mensaje.toLowerCase()

    // COMANDO DE EMERGENCIA (Solo Dueño)
    if (esDueño && (msgLower === 'para' || msgLower === 'stop' || msgLower === 'quieto')) {
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
        log(`⚡ PROCESANDO de ${usuario} (${esDueño ? 'Dueño' : 'Invitado'}): "${mensaje}"`)
        
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)},y:${Math.floor(p.y)},z:${Math.floor(p.z)}`
        
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let infoDueño = target ? `Dueño en:x:${Math.floor(target.position.x)},y:${Math.floor(target.position.y)},z:${Math.floor(target.position.z)}` : "Dueño:?"
        
        const entorno = escanearEntorno(bot)

        chatHistory.push(`${usuario}: ${mensaje}`)
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift()

        const prompt = `ESTADO ACTUAL:
- Mi Posición: ${botPos}
- ${infoDueño}
- Visión: ${entorno}
- Historial reciente: ${chatHistory.join(' | ')}

USUARIO ACTUAL: ${usuario} (${esDueño ? 'ES EL DUEÑO' : 'NO ES EL DUEÑO'})
MENSAJE: "${mensaje}"`

        try {
            const response = await generateResponse(prompt)
            log(`💬 IA: ${response}`)

            // 1. Extraer y limpiar el mensaje de texto (sin comandos # y sin coordenadas sueltas)
            let textoLimpio = response.replace(/#\w+.*?(\s|$)/g, '').trim()
            
            // SEGURIDAD: Eliminar cualquier patrón de coordenadas (3 números seguidos) para no exponer la base
            textoLimpio = textoLimpio.replace(/-?\d+[,\s]+-?\d+[,\s]+-?\d+/g, '').trim()
            
            // Limpiar conectores huérfanos y puntuación sobrante
            textoLimpio = textoLimpio.replace(/\s+/g, ' ')
            textoLimpio = textoLimpio.replace(/\b(y luego|y después|y)\b\s*[.,]?\s*$/gi, '').trim()
            textoLimpio = textoLimpio.replace(/[.,\s]+$/, '').trim()
            textoLimpio = textoLimpio.replace(/^[,.\s]+/, '')

            if (textoLimpio) {
                bot.chat(textoLimpio.replace(/\n/g, ' '))
                chatHistory.push(`Pollovis: ${textoLimpio}`)
            }

            // 2. Ejecutar Comandos (SOLO SI ES EL DUEÑO)
            if (esDueño) {
                // #GOTO (Soporta múltiples destinos secuenciales)
                if (response.includes('#GOTO')) {
                    const matches = Array.from(response.matchAll(/#GOTO\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/gi))
                    if (matches.length > 0) {
                        (async () => {
                            for (let i = 0; i < matches.length; i++) {
                                const match = matches[i]
                                const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                                try {
                                    log(`📍 Navegando a punto ${i+1}: ${x}, ${y}, ${z}`)
                                    // El primer punto (aproximación) es más flexible, el último (top) es exacto
                                    const goal = (i === matches.length - 1) ? new goals.GoalBlock(x, y, z) : new goals.GoalNear(x, y, z, 0.8)
                                    await bot.pathfinder.goto(goal)
                                } catch (e) {
                                    log(`⚠️ No pude llegar al punto ${i+1}: ${e.message}`)
                                }
                            }
                        })()
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
            } else if (response.includes('#')) {
                log(`⚠️ Intento de comando bloqueado para usuario: ${usuario}`)
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
    // Log para debug (puedes quitarlo luego)
    if (!msg.includes(bot.username)) log(`📩 Mensaje recibido: ${msg}`)

    // Ignorar mensajes del propio bot
    if (msg.includes(bot.username)) return

    // 1. Detectar Susurros (Whispers)
    if (msg.includes('-> me') || msg.includes('whispers to you')) {
        const whisperMatch = msg.match(/(\w+)\s+(?:whispers to you|-> me)\s*:\s*(.*)/i)
        if (whisperMatch) {
            procesarMensaje(whisperMatch[1], whisperMatch[2], 'whisper')
            return
        }
    }

    // 2. Detectar Chat Global con Prefijos (Ej: [Not Secure] [Dueño] SrLeonardo: hola)
    // Este regex busca el último nombre antes de los dos puntos, saltando prefijos entre corchetes
    const chatMatch = msg.match(/(?:\[.*?\]\s*)*(\w+)\s*:\s*(.*)/)
    if (chatMatch) {
        const usuario = chatMatch[1]
        const contenido = chatMatch[2]
        
        // Evitar procesar mensajes del sistema o logs
        if (usuario === 'Server' || usuario === 'INFO' || usuario === 'WARN') return
        
        procesarMensaje(usuario, contenido, 'chat_global_parsed')
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