const Vec3 = require('vec3')

// Planos de construcciones
const BLUEPRINTS = {
    'casa': [
        // Suelo (Cobblestone)
        { x: 0, y: 0, z: 0, type: 'cobblestone' }, { x: 1, y: 0, z: 0, type: 'cobblestone' }, { x: 2, y: 0, z: 0, type: 'cobblestone' },
        { x: 0, y: 0, z: 1, type: 'cobblestone' }, { x: 1, y: 0, z: 1, type: 'cobblestone' }, { x: 2, y: 0, z: 1, type: 'cobblestone' },
        { x: 0, y: 0, z: 2, type: 'cobblestone' }, { x: 1, y: 0, z: 2, type: 'cobblestone' }, { x: 2, y: 0, z: 2, type: 'cobblestone' },
        // Paredes (Planks) - Altura 1
        { x: 0, y: 1, z: 0, type: 'plank' }, { x: 1, y: 1, z: 0, type: 'plank' }, { x: 2, y: 1, z: 0, type: 'plank' },
        { x: 0, y: 1, z: 1, type: 'plank' }, /* Puerta en 1,1,1 */ { x: 2, y: 1, z: 1, type: 'plank' },
        { x: 0, y: 1, z: 2, type: 'plank' }, { x: 1, y: 1, z: 2, type: 'plank' }, { x: 2, y: 1, z: 2, type: 'plank' },
        // Paredes (Planks) - Altura 2
        { x: 0, y: 2, z: 0, type: 'plank' }, { x: 1, y: 2, z: 0, type: 'plank' }, { x: 2, y: 2, z: 0, type: 'plank' },
        { x: 0, y: 2, z: 1, type: 'plank' }, { x: 1, y: 2, z: 1, type: 'plank' }, { x: 2, y: 2, z: 1, type: 'plank' },
        { x: 0, y: 2, z: 2, type: 'plank' }, { x: 1, y: 2, z: 2, type: 'plank' }, { x: 2, y: 2, z: 2, type: 'plank' },
        // Techo (Glass/Planks)
        { x: 0, y: 3, z: 0, type: 'glass' }, { x: 1, y: 3, z: 0, type: 'glass' }, { x: 2, y: 3, z: 0, type: 'glass' },
        { x: 0, y: 3, z: 1, type: 'glass' }, { x: 1, y: 3, z: 1, type: 'glass' }, { x: 2, y: 3, z: 1, type: 'glass' },
        { x: 0, y: 3, z: 2, type: 'glass' }, { x: 1, y: 3, z: 2, type: 'glass' }, { x: 2, y: 3, z: 2, type: 'glass' },
    ]
}

let building = false

async function construirEstructura(bot, nombre, startX, startY, startZ) {
    const blueprint = BLUEPRINTS[nombre]
    if (!blueprint) {
        bot.chat(`No tengo planos para "${nombre}".`)
        return
    }

    // 1. Verificar materiales necesarios
    const materialesNecesarios = {}
    blueprint.forEach(b => {
        materialesNecesarios[b.type] = (materialesNecesarios[b.type] || 0) + 1
    })

    let faltaMaterial = false
    for (const [tipo, cantidad] of Object.entries(materialesNecesarios)) {
        const item = bot.inventory.items().find(i => i.name.includes(tipo))
        const total = item ? item.count : 0
        if (total < cantidad) {
            bot.chat(`Me faltan ${cantidad - total} de ${tipo}.`)
            faltaMaterial = true
        }
    }

    if (faltaMaterial) return

    bot.chat(`Iniciando construcción de ${nombre}...`)
    building = true

    for (const block of blueprint) {
        if (!building) break // Parada de emergencia

        const targetPos = new Vec3(startX + block.x, startY + block.y, startZ + block.z)
        
        // Si ya hay algo que no sea aire, saltar
        if (bot.blockAt(targetPos).name !== 'air') continue

        const item = bot.inventory.items().find(i => i.name.includes(block.type))
        if (!item) {
            bot.chat(`¡Se me acabó el ${block.type}!`)
            break
        }

        try {
            // Moverse cerca si es necesario
            if (bot.entity.position.distanceTo(targetPos) > 4) {
                const { goals } = require('mineflayer-pathfinder')
                await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 3))
            }

            await bot.equip(item, 'hand')
            
            // Buscar bloque de apoyo
            const faces = [new Vec3(0, -1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]
            let referenceBlock = null
            let faceVector = null

            for (const f of faces) {
                const ref = bot.blockAt(targetPos.plus(f))
                if (ref && ref.name !== 'air') {
                    referenceBlock = ref
                    faceVector = f.scaled(-1)
                    break
                }
            }

            if (referenceBlock) {
                await bot.placeBlock(referenceBlock, faceVector)
            } else {
                // Si no hay apoyo, intentar ponerlo debajo (scaffolding básico)
                bot.chat(`Buscando apoyo para bloque en ${targetPos.x} ${targetPos.y} ${targetPos.z}`)
            }
        } catch (err) {
            console.error(`Error construyendo bloque: ${err.message}`)
        }
    }

    bot.chat("Construcción finalizada.")
    building = false
}

function stopBuilding() {
    building = false
}

async function construirCamino(bot, x1, y1, z1, x2, y2, z2, tipo) {
    bot.chat(`Trazando camino de ${tipo}...`)
    building = true
    
    const start = new Vec3(x1, y1, z1)
    const end = new Vec3(x2, y2, z2)
    const distance = Math.floor(start.distanceTo(end))
    
    for (let i = 0; i <= distance; i++) {
        if (!building) break
        
        const t = i / distance
        const currX = Math.floor(x1 + (x2 - x1) * t)
        const currY = Math.floor(y1 + (y2 - y1) * t)
        const currZ = Math.floor(z1 + (z2 - z1) * t)
        const pos = new Vec3(currX, currY, currZ)

        // Colocar el bloque en el suelo (reemplazando lo que haya o encima)
        const item = bot.inventory.items().find(item => item.name.includes(tipo))
        if (!item) {
            bot.chat(`Me falta ${tipo} para seguir el camino.`)
            break
        }

        try {
            if (bot.entity.position.distanceTo(pos) > 4) {
                const { goals } = require('mineflayer-pathfinder')
                await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2))
            }
            
            await bot.equip(item, 'hand')
            const blockBelow = bot.blockAt(pos.offset(0, -1, 0))
            if (blockBelow && blockBelow.name !== 'air') {
                await bot.placeBlock(blockBelow, new Vec3(0, 1, 0))
            }
        } catch (e) {}
    }
    bot.chat("Camino terminado.")
    building = false
}

let lastScannedBlueprint = null

async function escanearEstructura(bot, radio) {
    bot.chat(`Escaneando área (radio ${radio})...`)
    const p = bot.entity.position
    const blueprint = []
    const materiales = {}

    for (let x = -radio; x <= radio; x++) {
        for (let y = 0; y <= radio * 2; y++) {
            for (let z = -radio; z <= radio; z++) {
                const blockPos = p.offset(x, y, z)
                const block = bot.blockAt(blockPos)
                if (block && block.name !== 'air') {
                    blueprint.push({
                        x, y, z,
                        type: block.name
                    })
                    materiales[block.name] = (materiales[block.name] || 0) + 1
                }
            }
        }
    }

    lastScannedBlueprint = blueprint
    const listaMateriales = Object.entries(materiales).map(([tipo, cant]) => `${cant} de ${tipo}`).join(', ')
    bot.chat(`Escaneo listo. Necesito: ${listaMateriales}. Dime dónde la clono.`)
}

async function clonarEstructura(bot) {
    if (!lastScannedBlueprint) {
        bot.chat("No tengo nada escaneado para clonar.")
        return
    }

    const p = bot.entity.position
    bot.chat("Iniciando clonación en mi posición actual...")
    
    // Reutilizamos la lógica de construcción
    building = true
    for (const block of lastScannedBlueprint) {
        if (!building) break
        const targetPos = p.offset(block.x, block.y, block.z)
        
        if (bot.blockAt(targetPos).name !== 'air') continue

        const item = bot.inventory.items().find(i => i.name.includes(block.type))
        if (!item) {
            bot.chat(`Me falta ${block.type} para seguir.`)
            break
        }

        try {
            if (bot.entity.position.distanceTo(targetPos) > 4) {
                const { goals } = require('mineflayer-pathfinder')
                await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 3))
            }
            await bot.equip(item, 'hand')
            const referenceBlock = bot.blockAt(targetPos.offset(0, -1, 0))
            if (referenceBlock && referenceBlock.name !== 'air') {
                await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0))
            }
        } catch (e) {}
    }
    bot.chat("Clonación terminada.")
    building = false
}

module.exports = { construirEstructura, stopBuilding, construirCamino, escanearEstructura, clonarEstructura }
