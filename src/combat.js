const { goals } = require('mineflayer-pathfinder')

const combatState = {
    enabled: false,
    assistOwner: false,
    guardOwner: false,
    focusQuery: null,
    lastAnnouncedTargetId: null,
    lastTargetPickAt: 0
}

const hostileMobNames = new Set([
    'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider', 'cave_spider',
    'enderman', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
    'guardian', 'elder_guardian', 'blaze', 'ghast', 'magma_cube', 'slime',
    'piglin', 'zombified_piglin', 'piglin_brute', 'wither_skeleton', 'wither',
    'phantom', 'shulker'
])

function notifyOwner(bot, text) {
    try {
        if (typeof bot.whisper === 'function') {
            bot.whisper('SrLeonardo', text)
            return
        }
    } catch {}
    bot.chat(text)
}

function setCombatMode(bot, { enabled, assistOwner, guardOwner, focusQuery }) {
    if (typeof enabled === 'boolean') combatState.enabled = enabled
    if (typeof assistOwner === 'boolean') combatState.assistOwner = assistOwner
    if (typeof guardOwner === 'boolean') combatState.guardOwner = guardOwner
    if (typeof focusQuery === 'string') combatState.focusQuery = focusQuery
    if (focusQuery === null) combatState.focusQuery = null

    if (!combatState.enabled) {
        try { bot.pvp.stop() } catch {}
        combatState.lastAnnouncedTargetId = null
    }
}

function findEntityByQuery(bot, query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return null
    return bot.nearestEntity((e) => {
        if (!e) return false
        const name = String(e.name || '').toLowerCase()
        const username = String(e.username || '').toLowerCase()
        return name.includes(q) || username.includes(q)
    })
}

function pickAssistTarget(bot) {
    const owner = bot.players['SrLeonardo']?.entity
    const origin = owner ? owner.position : bot.entity.position

    // No atacar jugadores por defecto (evita grief/friendly fire)
    const candidates = Object.values(bot.entities)
        .filter((e) => e && e.isValid)
        .filter((e) => e.type === 'mob')
        .filter((e) => hostileMobNames.has(e.name))
        .filter((e) => e.position.distanceTo(origin) <= 10)
        .filter((e) => e.position.distanceTo(bot.entity.position) <= 16)

    if (candidates.length === 0) return null
    candidates.sort((a, b) => a.position.distanceTo(origin) - b.position.distanceTo(origin))
    return candidates[0]
}

function combatTick(bot, following, enableFollowCallback) {
    if (!combatState.enabled) return

    // Si está en modo guardia, prioriza estar cerca del dueño
    if (combatState.guardOwner && !following) {
        const t = bot.players['SrLeonardo']?.entity
        if (t) {
            enableFollowCallback()
            bot.pathfinder.setGoal(new goals.GoalFollow(t, 2), true)
        }
    }

    const currentTarget = bot.pvp && bot.pvp.target
    const targetValid = currentTarget && currentTarget.isValid

    // Si ya hay target válido, seguir atacando
    if (!targetValid) {
        const now = Date.now()
        if (now - combatState.lastTargetPickAt > 800) {
            combatState.lastTargetPickAt = now

            let target = null
            if (combatState.focusQuery) {
                target = findEntityByQuery(bot, combatState.focusQuery)
            }
            if (!target && combatState.assistOwner) {
                target = pickAssistTarget(bot)
            }

            if (target) {
                if (combatState.lastAnnouncedTargetId !== target.id) {
                    combatState.lastAnnouncedTargetId = target.id
                    notifyOwner(bot, `⚔️ En combate: ${target.name || target.username}`)
                }
                bot.pvp.attack(target)
            }
        }
    }
}

module.exports = {
    combatState,
    setCombatMode,
    combatTick,
    notifyOwner
}
