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

    const nombresBloques = todosLosBloques.map(pos => {
        const b = bot.blockAt(pos)
        let nombre = b.name
        if (nombre.includes('ladder')) nombre = 'ESCALERA_MANO (ladder)'
        if (nombre.includes('stairs')) nombre = 'ESCALON (stairs)'
        return `${nombre} en ${pos.x},${pos.y},${pos.z}`
    })

    let vision = ""
    if (entidades.length > 0) vision += `Entidades: ${entidades.join(', ')}. `
    if (nombresBloques.length > 0) vision += `Bloques: ${nombresBloques.join(', ')}. `
    if (vision === "") vision = "No veo nada relevante cerca."
    
    return vision
}

module.exports = { escanearEntorno }