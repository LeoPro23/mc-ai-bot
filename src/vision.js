function escanearEntorno(bot) {
    const entidades = Object.values(bot.entities)
        .filter(e => e.position.distanceTo(bot.entity.position) < 10 && e.username !== bot.username)
        .map(e => {
            if (e.type === 'player') return `Jugador: ${e.username}`
            if (e.type === 'mob') return `Mob: ${e.name}`
            return null
        }).filter(Boolean).slice(0, 5)

    // 1. Bloques de Navegación (Prioridad Alta: Escaleras y Puertas)
    const bloquesNavegacion = bot.findBlocks({
        matching: (block) => {
            return block && (
                block.name.includes('ladder') || 
                block.name.includes('stairs') ||
                block.name.includes('door') ||
                block.name.includes('gate')
            )
        },
        maxDistance: 32,
        count: 100 // ¡Aumentado para ver escaleras largas completas!
    })

    // 2. Bloques de Interés (Recursos)
    const bloquesRecursos = bot.findBlocks({
        matching: (block) => {
            return block && (
                block.name.includes('chest') || 
                block.name.includes('bed') || 
                block.name.includes('log') || 
                block.name.includes('ore') || 
                block.name.includes('diamond') ||
                block.name.includes('plank')
            )
        },
        maxDistance: 16, // Menos rango para no saturar
        count: 20
    })
    
    const todosLosBloques = [...bloquesNavegacion, ...bloquesRecursos]

    // Ordenar por distancia para que los más cercanos estén primero
    todosLosBloques.sort((a, b) => {
        return a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position)
    })

    const nombresBloques = todosLosBloques.slice(0, 15).map(pos => {
        const b = bot.blockAt(pos)
        let nombre = b.name
        if (nombre.includes('ladder')) nombre = 'ESCALERA'
        if (nombre.includes('stairs')) nombre = 'ESCALON'
        
        // Añadir indicador de altura relativa
        const relY = pos.y - Math.floor(bot.entity.position.y)
        const alturaStr = relY > 0 ? `+${relY}` : relY < 0 ? `${relY}` : "nivel"
        
        return `${nombre}(${pos.x},${pos.y},${pos.z},${alturaStr})`
    })

    let vision = ""
    if (entidades.length > 0) vision += `Entidades: ${entidades.join(', ')}. `
    if (nombresBloques.length > 0) vision += `Bloques: ${nombresBloques.join(', ')}. `
    
    // Añadir Inventario
    const inventario = bot.inventory.items()
        .map(item => `${item.name} x${item.count}`)
        .join(', ')
    if (inventario) vision += `Inventario: ${inventario}. `

    if (vision === "") vision = "No veo nada relevante cerca."
    
    return vision
}

module.exports = { escanearEntorno }