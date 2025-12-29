function escanearEntorno(bot) {
    const entidades = Object.values(bot.entities)
        .filter(e => e.position.distanceTo(bot.entity.position) < 12 && e.id !== bot.entity.id)
        .map(e => {
            const dist = Math.floor(e.position.distanceTo(bot.entity.position))
            const nombre = e.username || e.name || e.displayName || (e.mobType ? e.mobType : e.type)
            
            if (!nombre || nombre === 'player') return null
            
            const categoria = (e.type === 'player') ? 'Jugador' : 
                              (e.type === 'mob') ? 'Mob' : 
                              (e.type === 'passive' || e.type === 'animal') ? 'Animal' : 'Entidad'
            
            return `${categoria}:${nombre}(${dist}m)`
        }).filter(Boolean).slice(0, 12)

    // 1. Bloques de Navegación (Prioridad: Escaleras, Puertas)
    const bloquesNavegacion = bot.findBlocks({
        matching: (block) => {
            return block && (
                block.name.includes('ladder') || 
                block.name.includes('stairs') ||
                block.name.includes('door')
            )
        },
        maxDistance: 16,
        count: 50
    })

    // Agrupar escaleras para encontrar la más alta y la más baja
    const ladders = bloquesNavegacion.filter(pos => bot.blockAt(pos).name.includes('ladder'))
    let ladderInfo = ""
    if (ladders.length > 0) {
        const highest = ladders.reduce((prev, current) => (prev.y > current.y) ? prev : current)
        const lowest = ladders.reduce((prev, current) => (prev.y < current.y) ? prev : current)
        ladderInfo = `ESCALERA(Base:x:${lowest.x},y:${lowest.y},z:${lowest.z} | Top:x:${highest.x},y:${highest.y+1},z:${highest.z}). `
    }

    // 2. Bloques de Interés (Recursos)
    const bloquesRecursos = bot.findBlocks({
        matching: (block) => {
            return block && (
                block.name.includes('chest') || 
                block.name.includes('ore') || 
                block.name.includes('diamond')
            )
        },
        maxDistance: 12,
        count: 10
    })
    
    const todosLosBloques = [...bloquesNavegacion.filter(p => !bot.blockAt(p).name.includes('ladder')), ...bloquesRecursos]

    const nombresBloques = todosLosBloques.slice(0, 10).map(pos => {
        const b = bot.blockAt(pos)
        let nombre = b.name
        if (nombre.includes('stairs')) nombre = 'ESCALON'
        const relY = pos.y - Math.floor(bot.entity.position.y)
        const alturaStr = relY > 0 ? `+${relY}` : relY < 0 ? `${relY}` : "nivel"
        return `${nombre}(x:${pos.x},y:${pos.y},z:${pos.z},${alturaStr})`
    })

    let vision = ladderInfo
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