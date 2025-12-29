let pendingDecision = null
let lastTpaAt = 0

function requestTeleportTo(bot, playerName) {
    if (!playerName) playerName = 'SrLeonardo'
    const now = Date.now()
    if (now - lastTpaAt < 12000) {
        bot.chat('Ya pedí TP hace poco; acepta la solicitud (normalmente /tpaccept).')
        return
    }
    lastTpaAt = now
    bot.chat(`/tpa ${playerName}`)
    bot.chat('Te envié solicitud de TP. Acepta (normalmente /tpaccept).')
}

function clearPendingDecision() {
    pendingDecision = null
}

function askOwnerDecision(bot, reason, opts = {}) {
    const now = Date.now()
    if (pendingDecision && pendingDecision.expiresAt > now) return

    pendingDecision = {
        reason,
        action: opts.action || null,
        targetName: opts.targetName || null,
        createdAt: now,
        expiresAt: now + 30000
    }

    // Mantener mensajes cortos para que el servidor no los parta a mitad de palabra.
    bot.chat('No hay camino claro. Opciones: 1=reintento, 2=espera, 3=pido TP. OK=proceder.')
    bot.chat('Si autorizas acciones riesgosas: responde RESCATE (30s).')
}

function handleOwnerResponse(bot, message, followTargetName, restartFollowCallback) {
    if (!pendingDecision || pendingDecision.expiresAt <= Date.now()) return false

    const msg = message.toLowerCase()

    if (/^\s*(ok|okay|si|sí|dale|procede|proceder)\s*$/i.test(msg)) {
        const action = pendingDecision.action
        const targetName = pendingDecision.targetName || followTargetName
        clearPendingDecision()
        if (action === 'tpa') {
            requestTeleportTo(bot, targetName)
            return true
        }
        bot.chat('Ok.')
        return true
    }
    if (/^\s*(cancelar|cancela|no)\s*$/i.test(msg)) {
        clearPendingDecision()
        bot.chat('Ok, cancelado.')
        return true
    }
    if (/^\s*1\s*$/i.test(msg) || /reintento/i.test(msg)) {
        clearPendingDecision()
        bot.chat('Reintentando...')
        restartFollowCallback()
        return true
    }
    if (/^\s*2\s*$/i.test(msg) || /quieto|espera/i.test(msg)) {
        clearPendingDecision()
        bot.chat('Ok, me quedo aquí y vuelvo a intentar en breve.')
        return true
    }
    if (/^\s*3\s*$/i.test(msg) || /(tpa|tp)/i.test(msg)) {
        const targetName = pendingDecision.targetName || followTargetName
        clearPendingDecision()
        requestTeleportTo(bot, targetName)
        return true
    }
    if (/\brescate\b/i.test(msg)) {
        clearPendingDecision()
        bot.chat('Recibido. Para evitar romper/construir por error, dime exactamente qué hacer con un comando # (por ejemplo #MINE, #BUILD, #HOUSE, #PATH).')
        return true
    }
    return false
}

module.exports = {
    askOwnerDecision,
    handleOwnerResponse,
    requestTeleportTo,
    clearPendingDecision
}
