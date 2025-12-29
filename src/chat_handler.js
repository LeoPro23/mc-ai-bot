const { generateResponse } = require('./ai')
const { setCombatMode, notifyOwner } = require('./combat')
const { handleOwnerResponse, requestTeleportTo } = require('./interaction')
const { getStatusReport } = require('./status')
const { irYRomper, atacarEntidad, golpearUnaVez, construirBloque, construirEstructura, stopBuilding, construirCamino, escanearEstructura, clonarEstructura } = require('./actions')
const { startFollow, stopFollow, climbNearestLadder, escaladaManualHacia, cardinalFromDelta, getNavigationState } = require('./navigation')
const { goals } = require('mineflayer-pathfinder')
const { MAX_HISTORY } = require('./config')
const Vec3 = require('vec3')

const chatHistory = []

// Helpers
function stripCoords(text) {
    if (!text) return text
    let t = text
    t = t.replace(/\bx\s*[:=]?\s*-?\d+\s*[,;\s]+\s*y\s*[:=]?\s*-?\d+\s*[,;\s]+\s*z\s*[:=]?\s*-?\d+\b/gi, '')
    t = t.replace(/\bx\s*-?\d+\s*[,;\s]+\s*y\s*-?\d+\s*[,;\s]+\s*z\s*-?\d+\b/gi, '')
    t = t.replace(/\b[xyz]\s*[:=]\s*-?\d+\b/gi, '')
    t = t.replace(/-?\d+\s*[,\s]\s*-?\d+\s*[,\s]\s*-?\d+/g, '')
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
    return text.replace(/#[A-Z_]+[^\n]*/gi, '')
}

function isSlashCommand(text) {
    const s = String(text || '').trim()
    return s.startsWith('/')
}

const recentMessages = new Map()
function shouldProcessMessage(usuario, mensaje, fuente) {
    const key = `${fuente}:${usuario}:${mensaje}`
    const now = Date.now()
    const last = recentMessages.get(key)
    if (last && (now - last) < 900) return false
    recentMessages.set(key, now)
    if (recentMessages.size > 250) {
        for (const [k, t] of recentMessages) {
            if (now - t > 15000) recentMessages.delete(k)
        }
    }
    return true
}

// Main Logic
async function procesarMensaje(bot, usuario, mensaje, fuente, isEating) {
    if (usuario === bot.username) return
    if (!shouldProcessMessage(usuario, mensaje, fuente)) return

    const esDueño = usuario.includes('SrLeonardo')
    const msgLower = mensaje.toLowerCase()

    // Get Navigation State
    const navState = getNavigationState()
    const { following, followTargetName } = navState

    // 1. Pending Decisions
    if (esDueño) {
        const handled = handleOwnerResponse(
            bot,
            mensaje,
            followTargetName,
            () => {
                // Restart follow callback
                startFollow(bot, followTargetName)
            }
        )
        if (handled) return
    }

    // 2. Emergency Stop
    if (esDueño && (
        msgLower === 'para' || msgLower === 'stop' || msgLower === 'quieto' ||
        msgLower.includes('deja de atacar') || msgLower.includes('deja de hacer') ||
        msgLower.includes('no hagas nada') || msgLower.includes('alto')
    )) {
        bot.pathfinder.setGoal(null)
        bot.stopDigging()
        bot.pvp.stop()
        try { setCombatMode(bot, { enabled: false, assistOwner: false, guardOwner: false, focusQuery: null }) } catch { }
        stopBuilding()
        stopFollow(bot)
        bot.chat("Me detengo.")
        return
    }

    // 3. Owner Shortcuts
    if (esDueño) {
        if (/(^|\b)(ven|sígueme|sigueme|follow)\b/i.test(mensaje)) {
            startFollow(bot, 'SrLeonardo')
            return
        }
        if (/(^|\b)(modo\s+guerra|war\s+mode|guerra\s+on)\b/i.test(mensaje)) {
            setCombatMode(bot, { enabled: true, assistOwner: true, guardOwner: true })
            notifyOwner(bot, 'Modo guerra activado: guardia + asistencia (solo mobs hostiles).')
            return
        }
        if (/(^|\b)(guerra\s+off|modo\s+guerra\s+off|war\s+off)\b/i.test(mensaje)) {
            setCombatMode(bot, { enabled: false, assistOwner: false, guardOwner: false, focusQuery: null })
            notifyOwner(bot, 'Modo guerra desactivado.')
            return
        }
        const focusMsg = mensaje.match(/\b(focus|enfoca)\s+(.+)$/i)
        if (focusMsg && focusMsg[2]) {
            setCombatMode(bot, { enabled: true, assistOwner: true, guardOwner: true, focusQuery: focusMsg[2].trim() })
            notifyOwner(bot, `Focus: ${focusMsg[2].trim()}`)
            return
        }
        if (/(^|\b)(haz\s+)?tpa\b/i.test(mensaje) || /\b(no\s+hay\s+camino|tepe|tp)\b/i.test(mensaje)) {
            requestTeleportTo(bot, usuario)
            return
        }
        if (/(^|\b)(sube|subelas|usa las escaleras|escalera)\b/i.test(mensaje)) {
            await climbNearestLadder(bot)
            return
        }
        if (/(^|\b)(estado|status|reporte)\b/i.test(mensaje)) {
            const report = getStatusReport(bot, following, followTargetName, isEating)
            bot.chat(report)
            return
        }
    }

    // 4. AI Interaction
    const mencionaBot = msgLower.includes('pollo') || msgLower.includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    if (mencionaBot || esPrivado) {
        console.log(`⚡ PROCESANDO de ${usuario} (${esDueño ? 'Dueño' : 'Invitado'}): "${mensaje}"`)

        const p = bot.entity.position
        const myY = Math.floor(p.y)
        const target = bot.players['SrLeonardo']?.entity
        const dx = target ? (target.position.x - p.x) : 0
        const dz = target ? (target.position.z - p.z) : 0
        const dist = target ? Math.floor(target.position.distanceTo(p)) : null
        const yDiff = target ? Math.floor(target.position.y - p.y) : null
        const dir = target ? cardinalFromDelta(dx, dz) : null

        // Scan environment
        const { escanearEntorno } = require('./vision')
        const { getAwarenessState } = require('./awareness')
        const entorno = escanearEntorno(bot)
        const eventosRecientes = getAwarenessState()

        chatHistory.push(`${usuario}: ${mensaje}`)
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift()

        const prompt = `ESTADO ACTUAL:
    - Mi nivel Y: ${myY}
    - Dueño: ${target ? `a ${dist}m hacia ${dir}${yDiff !== null ? (yDiff > 1 ? `, arriba ${yDiff}` : yDiff < -1 ? `, abajo ${Math.abs(yDiff)}` : '') : ''}` : 'no visible'}
    - Visión (sin coordenadas): ${entorno}
    - EVENTOS RECIENTES (Daño/Peligro): ${eventosRecientes || 'Ninguno relevante'}
    - Historial reciente: ${chatHistory.join(' | ')}

USUARIO ACTUAL: ${usuario} (${esDueño ? 'ES EL DUEÑO' : 'NO ES EL DUEÑO'})
MENSAJE: "${mensaje}"`

        try {
            const response = await generateResponse(prompt)
            console.log(`💬 IA: ${response}`)

            let textoLimpio = stripCommandLines(response).trim()
            textoLimpio = stripCoords(textoLimpio).trim()

            if (textoLimpio && isSlashCommand(textoLimpio)) {
                textoLimpio = ''
            }

            textoLimpio = textoLimpio.replace(/\s+/g, ' ')
            textoLimpio = textoLimpio.replace(/\b(y luego|y después|y)\b\s*[.,]?\s*$/gi, '').trim()
            textoLimpio = textoLimpio.replace(/[.,\s]+$/, '').trim()
            textoLimpio = textoLimpio.replace(/^[,.\s]+/, '')

            if (textoLimpio) {
                bot.chat(textoLimpio.replace(/\n/g, ' '))
                chatHistory.push(`Pollovis: ${textoLimpio}`)
            }

            // Execute AI Commands
            if (esDueño) {
                // ... Commands ...
                if (response.includes('#WAR')) {
                    const m = response.match(/#WAR\s+(ON|OFF)/i)
                    if (m && m[1].toUpperCase() === 'ON') {
                        setCombatMode(bot, { enabled: true, assistOwner: true, guardOwner: true })
                        notifyOwner(bot, 'Modo guerra activado.')
                    } else if (m && m[1].toUpperCase() === 'OFF') {
                        setCombatMode(bot, { enabled: false, assistOwner: false, guardOwner: false, focusQuery: null })
                        notifyOwner(bot, 'Modo guerra desactivado.')
                    }
                }
                if (response.includes('#ASSIST')) {
                    const m = response.match(/#ASSIST\s+(ON|OFF)/i)
                    if (m && m[1].toUpperCase() === 'ON') {
                        setCombatMode(bot, { enabled: true, assistOwner: true })
                        notifyOwner(bot, 'Asistencia activada.')
                    } else if (m && m[1].toUpperCase() === 'OFF') {
                        setCombatMode(bot, { assistOwner: false })
                        notifyOwner(bot, 'Asistencia desactivada.')
                    }
                }
                if (response.includes('#GUARD')) {
                    const m = response.match(/#GUARD\s+(ON|OFF)/i)
                    if (m && m[1].toUpperCase() === 'ON') {
                        setCombatMode(bot, { enabled: true, guardOwner: true })
                        notifyOwner(bot, 'Guardia activada.')
                    } else if (m && m[1].toUpperCase() === 'OFF') {
                        setCombatMode(bot, { guardOwner: false })
                        notifyOwner(bot, 'Guardia desactivada.')
                    }
                }
                if (response.includes('#FOCUS')) {
                    const m = response.match(/#FOCUS\s+([^#\n\r]+)/i)
                    if (m && m[1]) {
                        setCombatMode(bot, { enabled: true, assistOwner: true, guardOwner: true, focusQuery: m[1].trim() })
                        notifyOwner(bot, `Focus: ${m[1].trim()}`)
                    }
                }
                if (response.includes('#UNFOCUS')) {
                    setCombatMode(bot, { focusQuery: null })
                    notifyOwner(bot, 'Focus limpiado.')
                }
                if (response.includes('#ASK_TP')) {
                    const m = response.match(/#ASK_TP\s+(\w+)?/i)
                    const targetName = (m && m[1]) ? m[1] : 'SrLeonardo'
                    // Defined in interaction.js, but we imported it? askOwnerDecision.
                    // Need to require it or pass it. I imported it? No, I missed importing askOwnerDecision.
                    // Will fix in require block.
                    const { askOwnerDecision } = require('./interaction')
                    askOwnerDecision(bot, 'ai_ask_tp', { action: 'tpa', targetName })
                }
                if (response.includes('#TPA')) {
                    const m = response.match(/#TPA\s+(\w+)?/i)
                    requestTeleportTo(bot, (m && m[1]) ? m[1] : 'SrLeonardo')
                }
                if (response.includes('#FOLLOW')) {
                    const m = response.match(/#FOLLOW\s+(\w+)?/i)
                    startFollow(bot, (m && m[1]) ? m[1] : 'SrLeonardo')
                }
                if (response.includes('#CLIMB')) {
                    await climbNearestLadder(bot)
                }
                if (response.includes('#GOTO')) {
                    const matches = Array.from(response.matchAll(/#GOTO\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/gi))
                    if (matches.length > 0) {
                        (async () => {
                            for (let i = 0; i < matches.length; i++) {
                                const match = matches[i]
                                const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                                try {
                                    console.log(`📍 Navegando a punto ${i + 1}: ${x}, ${y}, ${z}`)
                                    const goal = (i === matches.length - 1) ? new goals.GoalBlock(x, y, z) : new goals.GoalNear(x, y, z, 0.8)
                                    await bot.pathfinder.goto(goal)
                                } catch (e) {
                                    console.log(`⚠️ No pude llegar al punto ${i + 1}: ${e.message}`)
                                    if (i === matches.length - 1 && y > bot.entity.position.y) {
                                        console.log("🧗 Activando ESCALADA MANUAL de emergencia...")
                                        await escaladaManualHacia(bot, x, y, z)
                                        console.log("🧗 Fin de maniobra manual.")
                                    }
                                }
                            }
                        })()
                    }
                }
                // Actions
                if (response.includes('#MINE')) {
                    const match = response.match(/#MINE\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                    if (match) irYRomper(bot, parseInt(match[1]), parseInt(match[2]), parseInt(match[3]))
                }
                if (response.includes('#KILL')) {
                    const match = response.match(/#KILL\s+(\w+)/i)
                    if (match) atacarEntidad(bot, match[1])
                }
                if (response.includes('#HIT')) {
                    const match = response.match(/#HIT\s+(\w+)/i)
                    if (match) golpearUnaVez(bot, match[1])
                }
                if (response.includes('#BUILD')) {
                    const match = response.match(/#BUILD\s+(\w+)\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                    if (match) construirBloque(bot, match[1], parseInt(match[2]), parseInt(match[3]), parseInt(match[4]))
                }
                if (response.includes('#HOUSE')) {
                    const p = bot.entity.position
                    construirEstructura(bot, 'casa', Math.floor(p.x) + 1, Math.floor(p.y), Math.floor(p.z) + 1)
                }
                if (response.includes('#PATH')) {
                    const match = response.match(/#PATH\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\w+)/i)
                    if (match) construirCamino(bot, parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4]), parseInt(match[5]), parseInt(match[6]), match[7])
                }
                if (response.includes('#SCAN')) escanearEstructura(bot, 5)
                if (response.includes('#CLONE')) clonarEstructura(bot)
            } else if (response.includes('#')) {
                console.log(`⚠️ Intento de comando bloqueado para usuario: ${usuario}`)
            }
        } catch (e) {
            console.log(`❌ Error API: ${e.message}`)
            bot.chat("Error cerebral.")
        }
    }
}

function setupChat(bot, isEatingFn) {
    // Configurar patrones de chat
    bot.once('spawn', () => {
        try {
            bot.chatAddPattern(/^\[Not Secure\] (?:\[.*?\] )?(\w+): (.*)$/, 'chat', 'chat_secure_fix')
            bot.chatAddPattern(/^(?:\[.*?\] )?(\w+): (.*)$/, 'chat', 'chat_standard_fix')
        } catch (e) {
            console.log(`⚠️ Error añadiendo patrones de chat: ${e.message}`)
        }
    })

    bot.on('chat', (u, m) => procesarMensaje(bot, u, m, 'chat', isEatingFn()))
    bot.on('whisper', (u, m) => procesarMensaje(bot, u, m, 'whisper', isEatingFn()))

    bot.on('messagestr', (msg) => {
        if (!msg.includes(bot.username)) console.log(`📩 Mensaje recibido: "${msg}"`)
        if (msg.startsWith(`[Pollo] ${bot.username}`) || msg.startsWith(`${bot.username}:`)) return

        const chatMatch = msg.match(/(?:\[.*?\]\s*)*(\w+)\s*:\s*(.*)/)
        if (chatMatch) {
            const usuario = chatMatch[1]
            const contenido = chatMatch[2]
            if (usuario === 'Server' || usuario === 'INFO' || usuario === 'WARN' || usuario === bot.username) return

            if (contenido.toLowerCase().includes(bot.username.toLowerCase()) || contenido.toLowerCase().includes('pollo')) {
                // processed by chat pattern usually
            }
        }
    })
}

module.exports = { setupChat }
