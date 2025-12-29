const { goals, Movements } = require('mineflayer-pathfinder')
const Vec3 = require('vec3')
const { askOwnerDecision, clearPendingDecision } = require('./interaction')

// State
let following = false
let followTargetName = 'SrLeonardo'
let lastFollowDist = null
let lastFollowProgressAt = 0
let lastNoPathAt = 0
let lastRescueAt = 0
let lastNoPathLog = 0

// Utils
function cardinalFromDelta(dx, dz) {
    const adx = Math.abs(dx)
    const adz = Math.abs(dz)
    if (adx < 0.5 && adz < 0.5) return 'a tu lado'
    if (adx >= adz) return dx > 0 ? 'este' : 'oeste'
    return dz > 0 ? 'sur' : 'norte'
}

function stopFollow(bot) {
    following = false
    lastFollowDist = null
    try { clearPendingDecision() } catch { }
    try { bot.pathfinder.setGoal(null) } catch { }
}

function startFollow(bot, username) {
    followTargetName = username
    const targetEntity = bot.players[username]?.entity
    if (!targetEntity) {
        bot.chat('No te veo cerca. Puedo pedir TP (#tpa) para llegar. ¿Procedo? Responde OK o 3.')
        askOwnerDecision(bot, 'not_visible', { action: 'tpa', targetName: username })
        return
    }
    following = true
    lastFollowDist = null
    lastFollowProgressAt = Date.now()
    bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 1), true)
    bot.chat('Voy contigo.')
}

async function escaladaManualHacia(bot, x, y, z) {
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

async function climbNearestLadder(bot, silent = false) {
    const ladderPositions = bot.findBlocks({
        matching: (block) => block && block.name && block.name.includes('ladder'),
        maxDistance: 16,
        count: 64
    })

    if (!ladderPositions || ladderPositions.length === 0) {
        if (!silent) bot.chat('No veo una escalera cerca.')
        return
    }

    const highest = ladderPositions.reduce((prev, curr) => (prev.y > curr.y ? prev : curr))
    const lowest = ladderPositions.reduce((prev, curr) => (prev.y < curr.y ? prev : curr))

    // Approach logic
    const neighbors = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]
    let approach = null

    // Try to find approach at -1 y relative (ground in front of ladder)
    for (const n of neighbors) {
        const p = lowest.offset(n.x, -1, n.z)
        const blockAtP = bot.blockAt(p)
        const blockBelow = bot.blockAt(p.offset(0, -1, 0))
        if (blockAtP && blockBelow && blockAtP.name === 'air' && blockBelow.name !== 'air') {
            approach = p
            break
        }
    }

    // Fallback approach at same level
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
        if (!silent) console.log(`⚠️ No pude aproximarme a la escalera: ${e.message}`)
    }

    const topTarget = new Vec3(highest.x, highest.y + 1, highest.z)
    try {
        await bot.pathfinder.goto(new goals.GoalBlock(topTarget.x, topTarget.y, topTarget.z))
    } catch (e) {
        if (!silent) console.log(`⚠️ Pathfinder falló al subir escalera: ${e.message}`)
        console.log('🧗 Activando ESCALADA MANUAL de emergencia...')
        await escaladaManualHacia(bot, topTarget.x, topTarget.y, topTarget.z)
        console.log('🧗 Fin de maniobra manual.')
    }
}

function setupNavigation(bot, combatTickCallback) {
    // Configura pathfinder Movements
    bot.once('spawn', () => {
        try {
            const mcData = require('minecraft-data')(bot.version)
            const defaultMove = new Movements(bot, mcData)

            // Configuración EXTREMA
            defaultMove.canDig = false
            defaultMove.allow1by1towers = true
            defaultMove.allowParkour = true
            defaultMove.canOpenDoors = true
            defaultMove.canOpenGates = true
            defaultMove.allowSprinting = true
            defaultMove.allowFreeMotion = true
            defaultMove.jumpCost = 0.05
            defaultMove.climbCost = 5
            defaultMove.exclusionAreas = []

            bot.pathfinder.setMovements(defaultMove)
            if (bot.pvp) bot.pvp.movements = defaultMove
        } catch (e) {
            console.log(`❌ Error configurando Movements: ${e.message}`)
        }
    })

    // Path update listener
    bot.on('path_update', (r) => {
        if (r.status === 'noPath') {
            if (bot.pathfinder.goal) {
                const now = Date.now()
                if (now - lastNoPathLog > 5000) {
                    console.log(`⚠️ Pathfinder: No hay ruta clara a ${bot.pathfinder.goal.x}, ${bot.pathfinder.goal.y}, ${bot.pathfinder.goal.z}`)
                    lastNoPathLog = now
                }
                if (following) lastNoPathAt = Date.now()
            }
        }
    })

    // Physics Tick Watchdog
    let tickCounter = 0
    bot.on('physicsTick', () => {
        tickCounter++
        if (tickCounter % 10 !== 0) return

        // Combat Tick
        try {
            if (combatTickCallback) {
                combatTickCallback(following, () => {
                    following = true
                    followTargetName = 'SrLeonardo'
                })
            }
        } catch { }

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

        if (dist < lastFollowDist - 0.6) {
            lastFollowDist = dist
            lastFollowProgressAt = now
            return
        }

        if (dist > lastFollowDist + 1.5) {
            lastFollowDist = dist
        }

        const stuckForMs = now - lastFollowProgressAt
        const noPathRecently = (now - lastNoPathAt) < 3500
        const rescueCooldown = (now - lastRescueAt) < 12000

        if (dist < 2.2) return
        if (stuckForMs < 4500 && !noPathRecently) return
        if (rescueCooldown) return

        const yDiff = target.position.y - bot.entity.position.y

        if (yDiff > 1.8) {
            lastRescueAt = now
                ; (async () => {
                    try {
                        console.log('🧭 Seguimiento atascado: intentando subir con escalera cercana...')
                        await climbNearestLadder(bot, true)
                    } catch (e) {
                        console.log(`⚠️ Rescate por escalera falló: ${e.message}`)
                    } finally {
                        const t = bot.players[followTargetName]?.entity
                        if (t) bot.pathfinder.setGoal(new goals.GoalFollow(t, 1), true)
                        lastFollowProgressAt = Date.now()
                        lastFollowDist = t ? t.position.distanceTo(bot.entity.position) : null
                    }
                })()
            return
        }

        askOwnerDecision(bot, noPathRecently ? 'noPath' : 'stuck')
    })
}

function getNavigationState() {
    return { following, followTargetName }
}

module.exports = {
    setupNavigation,
    startFollow,
    stopFollow,
    climbNearestLadder,
    escaladaManualHacia,
    cardinalFromDelta,
    getNavigationState
}
