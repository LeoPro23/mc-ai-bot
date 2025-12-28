const Vec3 = require('vec3')
const { goals } = require('mineflayer-pathfinder')

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

module.exports = { irYRomper }