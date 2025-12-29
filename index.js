const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const toolPlugin = require('mineflayer-tool').plugin
const pvp = require('mineflayer-pvp').plugin
const { MC_HOST, MC_PORT, MC_USER, MC_AUTH_PASS } = require('./src/config')
const { startWebServer } = require('./src/web')
const { initAI } = require('./src/ai')
const { setupNavigation } = require('./src/navigation')
const { setupChat } = require('./src/chat_handler')
const { setupAwareness } = require('./src/awareness')

// Logs con hora
function log(msg) {
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false })
    console.log(`[${time}] ${msg}`)
}

log('--- INICIANDO SISTEMA POLLOVIS 5.3 (MODULAR REFACTOR) ---')

// Servicios Base
startWebServer()
initAI()

function initBot() {
    log(`🔄 Conectando...`)
    const bot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USER,
        version: '1.21.4',
        auth: 'offline',
        checkTimeoutInterval: 60000
    })

    // Plugins
    bot.loadPlugin(pathfinder)
    bot.loadPlugin(toolPlugin)
    bot.loadPlugin(pvp)

    // Estado local (Comida)
    let isEating = false

    // Modulos
    setupNavigation(bot)
    setupChat(bot, () => isEating)
    setupAwareness(bot)

    // Eventos Básicos
    bot.once('spawn', () => {
        log(`🚀 ${bot.username} conectado.`)
        if (MC_AUTH_PASS) bot.chat(`/login ${MC_AUTH_PASS}`)
    })

    bot.on('error', (e) => log(`Error: ${e}`))

    bot.on('end', () => {
        log('Desconectado. Reconectando...')
        setTimeout(initBot, 10000)
    })

    // Auto-Comer (Logic kept in index for simplicity/safety)
    bot.on('health', async () => {
        if (isEating) return
        if (bot.food < 15) {
            const food = bot.inventory.items().find(item => {
                const data = require('minecraft-data')(bot.version).foodsByName[item.name]
                return data !== undefined
            })
            if (food) {
                try {
                    isEating = true
                    await bot.equip(food, 'hand')
                    await bot.consume()
                } catch (err) {
                    if (err.message !== 'Consuming cancelled due to calling bot.consume() again') {
                        log(`⚠️ Error comiendo: ${err.message}`)
                    }
                } finally {
                    isEating = false
                }
            }
        }
    })
}

initBot()