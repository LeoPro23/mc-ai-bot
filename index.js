const mineflayer = require('mineflayer')
require('dotenv').config() // Cargar variables de entorno .env
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const toolPlugin = require('mineflayer-tool').plugin // IMPORTANTE: Cargar el plugin
const { GoogleGenerativeAI } = require('@google/generative-ai')
const http = require('http')
const Vec3 = require('vec3')

console.log('--- INICIANDO SISTEMA POLLOVIS 5.1 (MINERO PRO) ---')

// --- 1. CONFIGURACIÓN ---
const MODELO_A_USAR = 'gemini-flash-latest' 

// Historial de conversación (15 mensajes)
const chatHistory = []
const MAX_HISTORY = 15

// --- 2. SERVIDOR WEB ---
const webServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`Bot Pollovis ONLINE. Modelo: ${MODELO_A_USAR}`)
})
webServer.listen(8080, '0.0.0.0', () => console.log('✅ Web Server OK (8080)'))

// --- 3. IA ---
let model = null
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// FUNCIÓN DE DIAGNÓSTICO PARA LISTAR MODELOS
async function listarModelos() {
    try {
        console.log("🔍 Buscando modelos disponibles...");
        // Hack para listar modelos usando fetch directo ya que el SDK a veces oculta esto
        const key = process.env.GEMINI_API_KEY;
        if (!key) return console.log("❌ No hay API KEY");
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();
        
        if (data.models) {
            console.log("✅ Modelos encontrados:");
            data.models.forEach(m => {
                if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`   - ${m.name.replace('models/', '')}`);
                }
            });
        }
    } catch (e) {
        console.log("⚠️ No se pudieron listar los modelos:", e.message);
    }
}

// Ejecutar diagnóstico antes de configurar el modelo
// listarModelos();

try {
    model = genAI.getGenerativeModel({ model: MODELO_A_USAR })
    console.log(`✅ IA Lista: ${MODELO_A_USAR}`)
} catch (e) { console.error('❌ Error IA:', e) }

// --- 4. FUNCIONES DE VISIÓN ---
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

// --- 5. FUNCIÓN DE MINERÍA MEJORADA ---
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

// --- 6. BOT MINECRAFT ---
function initBot() {
  console.log(`🔄 Conectando...`)

  const bot = mineflayer.createBot({
    host: process.env.MC_HOST,
    port: parseInt(process.env.MC_PORT) || 25565,
    username: process.env.MC_USER || 'POLLOVIS',
    version: '1.21.4',
    auth: 'offline',
    checkTimeoutInterval: 60000 
  })

  // CARGAR PLUGINS
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(toolPlugin) // <--- Cargamos el plugin de herramientas

  bot.once('spawn', () => {
    console.log(`🚀 ${bot.username} conectado.`)
    bot.chat(`/login ${process.env.MC_AUTH_PASS}`)
    
    try {
        const mcData = require('minecraft-data')(bot.version)
        const defaultMove = new Movements(bot, mcData)
        
        // MANTENEMOS ESTO PARA QUE CAMINE SIN ROMPER TU CASA
        defaultMove.canDig = false 
        defaultMove.allow1by1towers = false 
        defaultMove.allowParkour = true 
        defaultMove.canOpenDoors = true
        defaultMove.canOpenGates = true
        
        bot.pathfinder.setMovements(defaultMove)
    } catch (e) {}
  })

  // DIAGNÓSTICO DE PATHFINDER
  bot.on('path_update', (r) => {
    if (r.status === 'noPath') {
        bot.chat("No encuentro camino para llegar ahí.")
    }
  })

  async function procesarMensaje(usuario, mensaje, fuente) {
    if (!model) return
    if (usuario === bot.username) return
    
    // FILTRO ESTRICTO: Solo SrLeonardo
    if (!usuario.includes('SrLeonardo')) return 

    // COMANDO DE EMERGENCIA
    const msgLower = mensaje.toLowerCase()
    if (msgLower === 'para' || msgLower === 'stop' || msgLower === 'quieto') {
        bot.pathfinder.setGoal(null)
        bot.stopDigging()
        bot.chat("Me detengo.")
        return
    }

    const mencionaBot = msgLower.includes('pollo') || msgLower.includes(bot.username.toLowerCase())
    const esPrivado = fuente === 'whisper' || mensaje.includes('-> me')

    if (mencionaBot || esPrivado) {
        console.log(`⚡ PROCESANDO de ${usuario}: "${mensaje}"`)
        
        const p = bot.entity.position
        const botPos = `x:${Math.floor(p.x)} y:${Math.floor(p.y)} z:${Math.floor(p.z)}`
        
        const target = Object.values(bot.players).find(p => p.username && p.username.includes('SrLeonardo'))?.entity
        let infoDueño = target ? `Dueño en: x:${Math.floor(target.position.x)} y:${Math.floor(target.position.y)} z:${Math.floor(target.position.z)}` : "Dueño lejos/oculto."
        
        const entorno = escanearEntorno(bot)

        chatHistory.push(`SrLeonardo: ${mensaje}`)
        if (chatHistory.length > MAX_HISTORY) chatHistory.shift()

        const prompt = `
          Eres POLLOVIS, un asistente útil en Minecraft.
          Pos: ${botPos}. Dueño: ${infoDueño}.
          (NOTA: Y es la altura. Si el dueño está ARRIBA, busca una ESCALERA_MANO y ve a su coordenada más alta).
          VISION: ${entorno}
          MEMORIA: ${chatHistory.join('\n')}
          
          CAPACIDADES:
          - Puedes MOVERTE (#GOTO).
          - Puedes ROMPER bloques (#MINE).
          - NO PUEDES colocar bloques, ni construir, ni abrir cofres.

          REGLAS ESTRICTAS:
          1. SOLO usa #MINE si la orden es explícita ("rompe", "pica", "tala", "mina").
          2. Si preguntan "¿qué hay?" o "¿qué ves?", SOLO describe la VISION. NUNCA rompas nada.
          3. Si te piden hacer algo que no puedes (como poner bloques), di "No sé construir".
          4. Si te regañan, pide perdón y no hagas nada físico.
          5. Si te piden un COMANDO (/tpa, /home), escribe el comando tal cual (ej: "/tpa SrLeonardo"). NO uses #.
          6. RESPONDE SIEMPRE EN UNA SOLA LÍNEA. Usa comas, no listas verticales.
          
          Mensaje nuevo: "${mensaje}"
        `

        try {
            const result = await model.generateContent(prompt)
            const response = result.response.text()
            console.log(`💬 Gemini: ${response}`)

            chatHistory.push(`Pollovis: ${response.replace(/#.*/, '').trim()}`)

            // Lógica de Comandos
            if (response.includes('#GOTO')) {
                const match = response.match(/#GOTO\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    const chatMsg = response.replace(/#GOTO.*/, '').trim()
                    if(chatMsg) bot.chat(chatMsg.replace(/\n/g, ' '))
                    bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
                }
            } 
            else if (response.includes('#MINE')) {
                const match = response.match(/#MINE\s+(?:x:)?\s*(-?\d+)[,\s]+(?:y:)?\s*(-?\d+)[,\s]+(?:z:)?\s*(-?\d+)/i)
                if (match) {
                    const x = parseInt(match[1]), y = parseInt(match[2]), z = parseInt(match[3])
                    const chatMsg = response.replace(/#MINE.*/, '').trim()
                    if(chatMsg) bot.chat(chatMsg.replace(/\n/g, ' '))
                    irYRomper(bot, x, y, z)
                }
            }
            else {
                bot.chat(response.replace(/\n/g, ' | '))
            }
        } catch (e) { 
            console.error("❌ Error API:", e.message)
            bot.chat("Error cerebral.")
        }
    }
  }

  // EVENTOS (Mismo filtro que validamos antes)
  bot.on('chat', (u, m) => procesarMensaje(u, m, 'chat'))
  bot.on('whisper', (u, m) => procesarMensaje(u, m, 'whisper'))
  bot.on('messagestr', (msg) => {
    if (msg.includes('-> me') && msg.includes('SrLeonardo')) {
        const contenido = msg.split(']')[1] || msg 
        procesarMensaje('SrLeonardo', contenido.trim(), 'messagestr_privado')
    }
  })

  bot.on('error', (e) => console.log('Error:', e))
  bot.on('end', () => {
    console.log('Desconectado. Reconectando...')
    setTimeout(initBot, 10000)
  })
}

initBot()