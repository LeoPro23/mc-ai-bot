const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const Vec3 = require('vec3')
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

    // Estado de seguimiento
    let following = false
    let followTargetName = 'SrLeonardo'
    let lastFollowDist = null
    let lastFollowProgressAt = 0
    let lastNoPathAt = 0
    let lastRescueAt = 0

    // Flujo de aprobación del dueño (cuando no hay camino / está atascado)
    let pendingDecision = null

    function clearPendingDecision() {
        pendingDecision = null
    }

    function requestTeleportTo(playerName) {
        if (!playerName) playerName = 'SrLeonardo'
        bot.chat(`/tpa ${playerName}`)
        bot.chat('Te envié solicitud de TP. Acepta (normalmente /tpaccept).')
    }

    function askOwnerDecision(reason, opts = {}) {
        const now = Date.now()
        if (pendingDecision && pendingDecision.expiresAt > now) return

        pendingDecision = {
            reason,
            action: opts.action || null,
            targetName: opts.targetName || null,
            createdAt: now,
            expiresAt: now + 30000
        }

        bot.chat(
            'No hay camino claro para llegar a ti. ¿Qué hago? ' +
            '1) Reintento seguirte, 2) Me quedo quieto y reintento, 3) Pido TP con /tpa. ' +
            'También puedes responder OK para que ejecute la opción recomendada. ' +
            'Si quieres que haga un rescate con picar/construir, responde: AUTORIZO RESCATE (30s).'
        )
    }

    function stopFollow() {
        following = false
        lastFollowDist = null
        try { bot.pathfinder.setGoal(null) } catch {}
    }

    function startFollow(username) {
        followTargetName = username
        const targetEntity = bot.players[username]?.entity
        if (!targetEntity) {
            bot.chat('No te veo cerca. Puedo pedir TP (#tpa) para llegar. ¿Procedo? Responde OK o 3.')
            askOwnerDecision('not_visible', { action: 'tpa', targetName: username })
            return
        }
        following = true
        lastFollowDist = null
        lastFollowProgressAt = Date.now()
        bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 1), true)
        bot.chat('Voy contigo.')
    }

    function stripCoords(text) {
        if (!text) return text
        let t = text
        // Eliminar patrones tipo x:-123 y:64 z:456 (con separadores variados, incluso saltos de línea)
        t = t.replace(/\bx\s*[:=]?\s*-?\d+\s*[,;\s]+\s*y\s*[:=]?\s*-?\d+\s*[,;\s]+\s*z\s*[:=]?\s*-?\d+\b/gi, '')
        // Variante sin dos puntos (x -123 y 64 z 456)
        t = t.replace(/\bx\s*-?\d+\s*[,;\s]+\s*y\s*-?\d+\s*[,;\s]+\s*z\s*-?\d+\b/gi, '')
        // Eliminar coordenadas sueltas etiquetadas x:123 / y:64 / z:-45
        t = t.replace(/\b[xyz]\s*[:=]\s*-?\d+\b/gi, '')
        // Eliminar tripletas numéricas ("123 64 -45" o "123,64,-45")
        t = t.replace(/-?\d+\s*[,\s]\s*-?\d+\s*[,\s]\s*-?\d+/g, '')

        // Eliminar líneas que quedaron como solo coords
        t = t
            .split(/\r?\n/)
            .filter((line) => {
                const s = String(line).trim()
                if (!s) return false
                if (/^(?:[xyz]\s*[:=]\s*)-?\d+$/i.test(s)) return false
                if (/^-?\d+(?:\s+|,)-?\d+(?:\s+|,)-?\d+$/i.test(s)) return false
                return true
            })
            .join('\n')
        return t
    }

    function stripCommandLines(text) {
        if (!text) return text
        // Quitar cualquier comando con # y el resto de esa línea
        return text.replace(/#[A-Z_]+[^\n]*/gi, '')
    }

    function isSlashCommand(text) {
        const s = String(text || '').trim()
        return s.startsWith('/')
    }

    function cardinalFromDelta(dx, dz) {
        const adx = Math.abs(dx)
        const adz = Math.abs(dz)
        if (adx < 0.5 && adz < 0.5) return 'a tu lado'
        if (adx >= adz) return dx > 0 ? 'este' : 'oeste'
        return dz > 0 ? 'sur' : 'norte'
    }

    async function escaladaManualHacia(x, y, z) {
        bot.pathfinder.setGoal(null)
        const targetPos = new Vec3(x, y, z)
        await bot.lookAt(targetPos)

        bot.setControlState('forward', true)
        bot.setControlState('jump', true)
        await bot.waitForTicks(10)
        bot.setControlState('jump', false)

        const deadline = Date.now() + 20000
        let lastY = bot.entity.position.y
        let lastProgressAt = Date.now()

        while (bot.entity.position.y < y && Date.now() < deadline) {
            await bot.lookAt(new Vec3(x, y + 1, z))
            await bot.waitForTicks(5)

            const currentY = bot.entity.position.y
            if (currentY > lastY + 0.01) {
                lastY = currentY
                lastProgressAt = Date.now()
            }
            if (Date.now() - lastProgressAt > 2500) break
        }

        bot.setControlState('forward', false)
    }

    async function climbNearestLadder() {
        const ladderPositions = bot.findBlocks({
            matching: (block) => block && block.name && block.name.includes('ladder'),
            maxDistance: 16,
            count: 64
        })

        if (!ladderPositions || ladderPositions.length === 0) {
            bot.chat('No veo una escalera cerca.')
            return
        }

        const highest = ladderPositions.reduce((prev, curr) => (prev.y > curr.y ? prev : curr))
        const lowest = ladderPositions.reduce((prev, curr) => (prev.y < curr.y ? prev : curr))

        // Buscar un punto caminable frente a la base en el suelo
        const neighbors = [
            { x: 1, z: 0 },
            { x: -1, z: 0 },
            { x: 0, z: 1 },
            { x: 0, z: -1 }
        ]

        let approach = null
        for (const n of neighbors) {
            const p = lowest.offset(n.x, -1, n.z)
            const blockAtP = bot.blockAt(p)
            const blockBelow = bot.blockAt(p.offset(0, -1, 0))
            if (blockAtP && blockBelow && blockAtP.name === 'air' && blockBelow.name !== 'air') {
                approach = p
                break
            }
        }

        if (!approach) {
            for (const n of neighbors) {
                const p = lowest.offset(n.x, 0, n.z)
                const blockAtP = bot.blockAt(p)
                const blockBelow = bot.blockAt(p.offset(0, -1, 0))
                if (blockAtP && blockBelow && blockAtP.name === 'air' && blockBelow.name !== 'air') {
                    approach = p
                    break
                }
            }
        }

        if (!approach) approach = lowest

        try {
            await bot.pathfinder.goto(new goals.GoalNear(approach.x, approach.y, approach.z, 0.8))
        } catch (e) {
            log(`⚠️ No pude aproximarme a la escalera: ${e.message}`)
        }

        const topTarget = new Vec3(highest.x, highest.y + 1, highest.z)
        try {
            await bot.pathfinder.goto(new goals.GoalBlock(topTarget.x, topTarget.y, topTarget.z))
        } catch (e) {
            log(`⚠️ Pathfinder falló al subir escalera: ${e.message}`)
            log('🧗 Activando ESCALADA MANUAL de emergencia...')
            await escaladaManualHacia(topTarget.x, topTarget.y, topTarget.z)
            log('🧗 Fin de maniobra manual.')
        }
    }

  bot.once('spawn', () => {
    log(`🚀 ${bot.username} conectado.`)
    if (MC_AUTH_PASS) bot.chat(`/login ${MC_AUTH_PASS}`)
    
    // Configurar patrones de chat para el servidor
    // Soporte para [Not Secure] [Rango] Usuario: Mensaje
    try {
        bot.chatAddPattern(/^\[Not Secure\] (?:\[.*?\] )?(\w+): (.*)$/, 'chat', 'chat_secure_fix')
        bot.chatAddPattern(/^(?:\[.*?\] )?(\w+): (.*)$/, 'chat', 'chat_standard_fix')
    } catch (e) {
        log(`⚠️ Error añadiendo patrones de chat: ${e.message}`)
    }

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
                        if (following) lastNoPathAt = Date.now()
        }
    }
  })

    // Watchdog de seguimiento: usa escaleras SOLO si está atascado.
    // Evita "sesgo" a escaleras: no sube por ver una; solo si no progresa siguiendo al dueño.
    let tickCounter = 0
    bot.on('physicsTick', () => {
        tickCounter++
        if (tickCounter % 10 !== 0) return // cada ~0.5s
        if (!following) return

        const target = bot.players[followTargetName]?.entity
        if (!target) return

        const dist = target.position.distanceTo(bot.entity.position)
        const now = Date.now()

        if (lastFollowDist === null) {
            lastFollowDist = dist
            lastFollowProgressAt = now
            return
        }

        // Progreso si la distancia baja de forma apreciable
        if (dist < lastFollowDist - 0.6) {
            lastFollowDist = dist
            lastFollowProgressAt = now
            return
        }

        // Si la distancia sube mucho, actualiza baseline pero no lo cuentes como progreso
        if (dist > lastFollowDist + 1.5) {
            lastFollowDist = dist
        }

        const stuckForMs = now - lastFollowProgressAt
        const noPathRecently = (now - lastNoPathAt) < 3500
        const rescueCooldown = (now - lastRescueAt) < 12000

        // Si está cerca, no hace falta rescate
        if (dist < 2.2) return

        // Solo rescatar si claramente está atascado o recibió noPath
        if (stuckForMs < 4500 && !noPathRecently) return
        if (rescueCooldown) return

        const yDiff = target.position.y - bot.entity.position.y

        // Decisión NO sesgada: solo intenta escaleras si el objetivo está arriba.
        // Si no hay diferencia clara de altura, pide instrucción al dueño.
        if (yDiff > 1.8) {
            lastRescueAt = now
            ;(async () => {
                try {
                    log('🧭 Seguimiento atascado: intentando subir con escalera cercana...')
                    await climbNearestLadder()
                } catch (e) {
                    log(`⚠️ Rescate por escalera falló: ${e.message}`)
                } finally {
                    // Reintentar seguir después del rescate
                    const t = bot.players[followTargetName]?.entity
                    if (t) bot.pathfinder.setGoal(new goals.GoalFollow(t, 1), true)
                    lastFollowProgressAt = Date.now()
                    lastFollowDist = t ? t.position.distanceTo(bot.entity.position) : null
                }
            })()
            return
        }

        askOwnerDecision(noPathRecently ? 'noPath' : 'stuck')
    })

  async function procesarMensaje(usuario, mensaje, fuente) {
    if (usuario === bot.username) return
    
    const esDueño = usuario.includes('SrLeonardo')
    const msgLower = mensaje.toLowerCase()

    // Resolver decisiones pendientes del dueño (ideal para /r o /msg)
    if (esDueño && pendingDecision && pendingDecision.expiresAt > Date.now()) {
        if (/^\s*(ok|okay|si|sí|dale|procede|proceder)\s*$/i.test(mensaje)) {
            const action = pendingDecision.action
            const targetName = pendingDecision.targetName || followTargetName
            clearPendingDecision()
            if (action === 'tpa') {
                requestTeleportTo(targetName)
                return
            }
            bot.chat('Ok.')
            return
        }
        if (/^\s*(cancelar|cancela|no)\s*$/i.test(mensaje)) {
            clearPendingDecision()
            bot.chat('Ok, cancelado.')
            return
        }
        if (/^\s*1\s*$/i.test(mensaje) || /reintento/i.test(mensaje)) {
            clearPendingDecision()
            bot.chat('Reintentando...')
            const t = bot.players[followTargetName]?.entity
            if (t) bot.pathfinder.setGoal(new goals.GoalFollow(t, 1), true)
            return
        }
        if (/^\s*2\s*$/i.test(mensaje) || /quieto|espera/i.test(mensaje)) {
            clearPendingDecision()
            bot.chat('Ok, me quedo aquí y vuelvo a intentar en breve.')
            return
        }
        if (/^\s*3\s*$/i.test(mensaje) || /(tpa|tp)/i.test(mensaje)) {
            const targetName = pendingDecision.targetName || followTargetName
            clearPendingDecision()
            requestTeleportTo(targetName)
            return
        }
        if (/autorizo\s+rescate/i.test(mensaje)) {
            clearPendingDecision()
            bot.chat('Recibido. Para evitar romper/construir por error, dime exactamente qué hacer con un comando # (por ejemplo #MINE, #BUILD, #HOUSE, #PATH).')
            return
        }
    }

    // COMANDO DE EMERGENCIA (Solo Dueño)
        if (esDueño && (msgLower === 'para' || msgLower === 'stop' || msgLower === 'quieto')) {
        bot.pathfinder.setGoal(null)
        bot.stopDigging()
        bot.pvp.stop()
        stopBuilding()
                stopFollow()
        bot.chat("Me detengo.")
        return
    }

        // Atajos del dueño (sin depender de la IA)
        if (esDueño) {
            if (/(^|\b)(ven|sígueme|sigueme|follow)\b/i.test(mensaje)) {
                startFollow('SrLeonardo')
                return
            }
            if (/(^|\b)(haz\s+)?tpa\b/i.test(mensaje) || /\b(no\s+hay\s+camino|tepe|tp)\b/i.test(mensaje)) {
                bot.chat(`/tpa ${usuario}`)
                bot.chat('Te envié solicitud de TP. Acepta (normalmente /tpaccept).')
                return
            }
            if (/(^|\b)(sube|subelas|usa las escaleras|escalera)\b/i.test(mensaje) && !/(\d+)/.test(mensaje)) {
                // Si pide subir y hay escalera cerca, intentar subirla.
                await climbNearestLadder()
                return
            }
        }

    const mencionaBot = msgLower.includes('pollo') || msgLower.includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    if (mencionaBot || esPrivado) {
        log(`⚡ PROCESANDO de ${usuario} (${esDueño ? 'Dueño' : 'Invitado'}): "${mensaje}"`)
        
        const p = bot.entity.position
        const myY = Math.floor(p.y)
        const target = bot.players['SrLeonardo']?.entity
        const dx = target ? (target.position.x - p.x) : 0
        const dz = target ? (target.position.z - p.z) : 0
        const dist = target ? Math.floor(target.position.distanceTo(p)) : null
        const yDiff = target ? Math.floor(target.position.y - p.y) : null
        const dir = target ? cardinalFromDelta(dx, dz) : null
        
        const entorno = escanearEntorno(bot)

        chatHistory.push(`${usuario}: ${mensaje}`)
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift()

        const prompt = `ESTADO ACTUAL:
    - Mi nivel Y: ${myY}
    - Dueño: ${target ? `a ${dist}m hacia ${dir}${yDiff !== null ? (yDiff > 1 ? `, arriba ${yDiff}` : yDiff < -1 ? `, abajo ${Math.abs(yDiff)}` : '') : ''}` : 'no visible'}
    - Visión (sin coordenadas): ${entorno}
    - Historial reciente: ${chatHistory.join(' | ')}

USUARIO ACTUAL: ${usuario} (${esDueño ? 'ES EL DUEÑO' : 'NO ES EL DUEÑO'})
MENSAJE: "${mensaje}"`

        try {
            const response = await generateResponse(prompt)
            log(`💬 IA: ${response}`)

            // 1. Extraer y limpiar el mensaje de texto (sin comandos # y sin coordenadas)
            let textoLimpio = stripCommandLines(response).trim()
            textoLimpio = stripCoords(textoLimpio).trim()

            // Nunca enviar comandos con "/" si vienen de la IA (evita /tpa que termina en help/spam)
            if (textoLimpio && isSlashCommand(textoLimpio)) {
                textoLimpio = ''
            }
            
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
                // #ASK_TP (propuesta de teleport con aprobación)
                if (response.includes('#ASK_TP')) {
                    const m = response.match(/#ASK_TP\s+(\w+)?/i)
                    const targetName = (m && m[1]) ? m[1] : 'SrLeonardo'
                    askOwnerDecision('ai_ask_tp', { action: 'tpa', targetName })
                }

                // #TPA (ejecuta solicitud /tpa directamente)
                if (response.includes('#TPA')) {
                    const m = response.match(/#TPA\s+(\w+)?/i)
                    const targetName = (m && m[1]) ? m[1] : 'SrLeonardo'
                    requestTeleportTo(targetName)
                }

                // #FOLLOW
                if (response.includes('#FOLLOW')) {
                    const m = response.match(/#FOLLOW\s+(\w+)?/i)
                    startFollow((m && m[1]) ? m[1] : 'SrLeonardo')
                }

                // #CLIMB (subir escalera cercana)
                if (response.includes('#CLIMB')) {
                    await climbNearestLadder()
                }

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
                                    
                                    // FALLBACK: Subida manual si falla el pathfinder y es un punto alto
                                    if (i === matches.length - 1 && y > bot.entity.position.y) {
                                        log("🧗 Activando ESCALADA MANUAL de emergencia...")
                                        await escaladaManualHacia(x, y, z)
                                        log("🧗 Fin de maniobra manual.")
                                    }
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
    // Log para debug
    if (!msg.includes(bot.username)) log(`📩 Mensaje recibido: "${msg}"`)

    // Ignorar mensajes que claramente vienen del bot (evitar bucles)
    // Asumimos que el bot tiene un prefijo o formato estándar
    if (msg.startsWith(`[Pollo] ${bot.username}`) || msg.startsWith(`${bot.username}:`)) return

    // 1. Detectar Susurros (Whispers)
    if (msg.includes('-> me') || msg.includes('whispers to you')) {
        const whisperMatch = msg.match(/(\w+)\s+(?:whispers to you|-> me)\s*:\s*(.*)/i)
        if (whisperMatch) {
            procesarMensaje(whisperMatch[1], whisperMatch[2], 'whisper')
            return
        }
    }

    // 2. Fallback para Chat Global si el evento 'chat' no se disparó
    // Intentamos parsear manualmente si vemos estructura de chat
    const chatMatch = msg.match(/(?:\[.*?\]\s*)*(\w+)\s*:\s*(.*)/)
    if (chatMatch) {
        const usuario = chatMatch[1]
        const contenido = chatMatch[2]
        
        // Evitar procesar mensajes del sistema, logs o del propio bot (si se escapó del filtro de arriba)
        if (usuario === 'Server' || usuario === 'INFO' || usuario === 'WARN' || usuario === bot.username) return
        
        // Si ya tenemos un patrón de chat configurado, el evento 'chat' lo manejará.
        // Pero por si acaso, verificamos si el contenido menciona al bot
        if (contenido.toLowerCase().includes(bot.username.toLowerCase()) || contenido.toLowerCase().includes('pollo')) {
             // Solo procesamos aquí si NO se disparó el evento 'chat' (difícil de saber, pero no hace daño duplicar si hay debounce)
             // Para evitar duplicados, confiamos en que procesarMensaje maneje el historial o que chatAddPattern funcione.
             // Por seguridad, dejaremos que 'chat' maneje lo estándar y esto sea solo para formatos muy raros.
        }
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