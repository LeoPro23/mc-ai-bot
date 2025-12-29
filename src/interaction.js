let pendingDecision = null

function requestTeleportTo(bot, playerName) {
    if (!playerName) playerName = 'SrLeonardo'
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

    bot.chat(
        'No hay camino claro para llegar a ti. ¿Qué hago? ' +
        '1) Reintento seguirte, 2) Me quedo quieto y reintento, 3) Pido TP con /tpa. ' +
        'También puedes responder OK para que ejecute la opción recomendada. ' +
        'Si quieres que haga un rescate con picar/construir, responde: AUTORIZO RESCATE (30s).'
    )
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
    if (/autorizo\s+rescate/i.test(msg)) {
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
