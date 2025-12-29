const Vec3 = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { construirEstructura, stopBuilding, construirCamino, escanearEstructura, clonarEstructura } = require('./builder')

async function irYRomper(bot, x, y, z) {
    const targetBlock = bot.blockAt(new Vec3(x, y, z))
    if (!targetBlock) {
        bot.chat("No veo ese bloque.")
        return
    }

    bot.chat(`Voy a por ${targetBlock.name}...`)

    try {
        // 1. Ir hacia el bloque (Respetando canDig = false, osea sin romper paredes)
        await bot.pathfinder.goto(new goals.GoalLookAtBlock(new Vec3(x, y, z), bot.world))

        // 2. Equipar herramienta (Gracias a mineflayer-tool)
        try {
            await bot.tool.equipForBlock(targetBlock, {})
        } catch (err) {
            console.log("No tengo herramienta óptima, usaré la mano.")
        }

        // 3. Romper
        await bot.dig(targetBlock)
        bot.chat("¡Roto!")
    } catch (err) {
        bot.chat("No pude llegar o romperlo.")
        console.error(err)
    }
}

async function atacarEntidad(bot, nombre) {
    const entity = bot.nearestEntity(e =>
        (e.name && e.name.toLowerCase().includes(nombre.toLowerCase())) ||
        (e.username && e.username.toLowerCase().includes(nombre.toLowerCase()))
    )

    if (!entity) {
        bot.chat(`No encuentro a ningún ${nombre} cerca.`)
        return
    }

    bot.chat(`¡Atacando a ${entity.name || entity.username}!`)
    bot.pvp.attack(entity)

    // Esperar a que la entidad muera o desaparezca
    const checkInterval = setInterval(() => {
        if (bot.health <= 0) {
            clearInterval(checkInterval)
            return
        }
        if (!entity || !entity.isValid || entity.health <= 0) {
            bot.chat(`He terminado con ${entity.name || entity.username || nombre}.`)
            bot.pvp.stop()
            clearInterval(checkInterval)
        }
    }, 1000)
}

async function golpearUnaVez(bot, nombre) {
    const entity = bot.nearestEntity(e =>
        (e.name && e.name.toLowerCase().includes(nombre.toLowerCase())) ||
        (e.username && e.username.toLowerCase().includes(nombre.toLowerCase()))
    )

    if (!entity) {
        bot.chat(`No encuentro a ningún ${nombre} cerca.`)
        return
    }

    bot.chat(`Un golpe a ${entity.name || entity.username}.`)
    try {
        await bot.lookAt(entity.position.offset(0, 1, 0))
    } catch { }
    try {
        bot.attack(entity)
    } catch (e) {
        console.error(e)
    }
    // Asegurar que no quede en modo pvp continuo
    try { bot.pvp.stop() } catch { }
}

async function construirBloque(bot, tipo, x, y, z) {
    const targetPos = new Vec3(x, y, z)

    if (bot.blockAt(targetPos).name !== 'air') {
        bot.chat("Ahí ya hay un bloque.")
        return
    }

    const item = bot.inventory.items().find(i => i.name.includes(tipo))
    if (!item) {
        bot.chat(`No tengo ${tipo} en mi inventario.`)
        return
    }

    try {
        await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 3))
        await bot.equip(item, 'hand')
        const referenceBlock = bot.blockAt(targetPos.offset(0, -1, 0))

        if (!referenceBlock || referenceBlock.name === 'air') {
            bot.chat("No tengo donde apoyar el bloque.")
            return
        }

        await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0))
        bot.chat(`Bloque de ${tipo} colocado.`)
    } catch (err) {
        bot.chat("No pude construir ahí.")
        console.error(err)
    }
}

module.exports = { irYRomper, atacarEntidad, golpearUnaVez, construirBloque, construirEstructura, stopBuilding, construirCamino, escanearEstructura, clonarEstructura }