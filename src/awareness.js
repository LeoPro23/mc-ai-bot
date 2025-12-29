const { notifyOwner } = require('./combat')

let recentDamage = {
    attacker: null,
    amount: 0,
    timestamp: 0,
    cause: null
}

let lastDeath = {
    timestamp: 0,
    cause: null,
    attacker: null
}

function getAwarenessState() {
    const now = Date.now()
    let info = []

    // Report recent damage (< 30s)
    if (now - recentDamage.timestamp < 30000 && recentDamage.attacker) {
        const timeAgo = Math.round((now - recentDamage.timestamp) / 1000)
        info.push(`⚠️ Recibí daño hace ${timeAgo}s de: ${recentDamage.attacker}`)
    }

    // Report recent death (< 2 min)
    if (now - lastDeath.timestamp < 120000) {
        const timeAgo = Math.round((now - lastDeath.timestamp) / 1000)
        info.push(`💀 Morí hace ${timeAgo}s. Causa: ${lastDeath.cause || 'Desconocida'} ${lastDeath.attacker ? `por ${lastDeath.attacker}` : ''}`)
    }

    return info.join('. ')
}

function setupAwareness(bot) {
    bot.on('entityHurt', (entity) => {
        if (entity !== bot.entity) return

        // Find attacker
        // Mineflayer doesn't always give attacker in entityHurt directly easily for all versions?
        // Actually entityHurt(entity) just says who got hurt. 
        // We can check nearby entities doing animation or assume handled by 'onDamage' if implemented, 
        // but often we rely on `bot.lastDamage`.

        // However, a better way in modern mineflayer might be to check recent entities or use a plugin?
        // Let's try to deduce it or listen to 'health' changes and look around? 
        // actually `entityHurt` event *only* passes the entity that was hurt.
        // We can't easily know WHO hurt us just from this event in vanilla mineflayer without parsing packets or using `bot.lastDamage`.
        // Let's use `bot.lastDamage` immediately.

        // Wait, there is a better way. We can look for entities swinging their arm nearby?
        // Or simply enable auto-defense if we lose health and there is a hostile nearby.

        // PRO TIP: mineflayer puts `attacker` in `bot.lastDamage`? No, not really exposed well.
        // Let's try to infer from `bot.entities` who is targeting us or closest.
    })

    // Better Listener: 'entitySwing' + proximity? No.
    // Let's use a simpler heuristic: If health drops, find nearest hostile mob < 4 blocks looking at us.

    let lastHealth = 20
    bot.on('health', () => {
        if (bot.health < lastHealth) {
            const damage = lastHealth - bot.health
            lastHealth = bot.health

            // Log logic
            const now = Date.now()

            // Find Candidate Attacker
            const candidate = bot.nearestEntity((e) => {
                if (e.type !== 'mob' && e.type !== 'player') return false
                if (e === bot.entity) return false
                if (e.username === 'SrLeonardo') return false // Never blame owner for auto-defense

                const dist = e.position.distanceTo(bot.entity.position)
                return dist < 5
            })

            if (candidate) {
                const name = candidate.name || candidate.username || 'Desconocido'
                recentDamage = {
                    attacker: name,
                    amount: damage,
                    timestamp: now,
                    cause: 'Ataque'
                }

                console.log(`⚔️ Recibí daño (-${damage.toFixed(1)}). Posible atacante: ${name}`)

                // REFLEX: Auto-Defense (if not owner)
                if (candidate.type === 'mob' || (candidate.type === 'player' && candidate.username !== 'SrLeonardo')) {
                    // Only fight back if not already fighting someone else or if idle
                    if (!bot.pvp.target) {
                        notifyOwner(bot, `⚔️ ¡Autodefensa activada contra ${name}!`)
                        bot.pvp.attack(candidate)
                    }
                }
            } else {
                recentDamage = { attacker: 'Desconocido (¿Caída/Fuego?)', amount: damage, timestamp: now, cause: 'Ambiente' }
                console.log(`❤️ Daño recibido (-${damage.toFixed(1)}) de fuente desconocida.`)
            }
        }
        lastHealth = bot.health
    })

    bot.on('death', () => {
        const now = Date.now()
        // Try to snapshot the last attacker from recentDamage if it was recent (<5s)
        let cause = 'Desconocida'
        let attacker = null

        if (now - recentDamage.timestamp < 5000) {
            cause = recentDamage.cause
            attacker = recentDamage.attacker
        }

        lastDeath = {
            timestamp: now,
            cause: cause,
            attacker: attacker
        }

        console.log(`💀 HE MUERTO. Causa probable: ${attacker || cause}`)
    })
}

module.exports = { setupAwareness, getAwarenessState }
