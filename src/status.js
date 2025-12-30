const { combatState } = require('./combat')

function getStatusReport(bot, following, followTargetName, isEating) {
    const health = Math.round(bot.health)
    const food = Math.round(bot.food)

    // Combat Status
    let combatMode = 'OFF'
    if (combatState.enabled) {
        combatMode = 'ON'
        if (combatState.assistOwner) combatMode += '+Assist'
        if (combatState.guardOwner) combatMode += '+Guard'
        if (combatState.focusQuery) combatMode += `(Focus: ${combatState.focusQuery})`
    }

    // Activity Status
    let activity = 'Idle'
    if (following) activity = `Siguiendo a ${followTargetName}`
    if (isEating) activity = 'Comiendo 🍗'

    // Check pathfinder goal for cleaner details
    if (bot.pathfinder.isMoving()) {
        if (!following) activity = 'Caminando...'
    }

    const target = bot.pvp && bot.pvp.target
    if (target) activity = `⚔️ Peleando con ${target.name || target.username}`

    // TODO: Add mining details if we had global mining state exposed.
    // For now this is better than before.

    // Equipment
    const hand = bot.heldItem ? bot.heldItem.name : 'Mano vacía'

    return `❤️ ${health} 🍗 ${food} | ⚔️ ${combatMode} | ✋ ${hand} | 🏃 ${activity}`
}

module.exports = { getStatusReport }
