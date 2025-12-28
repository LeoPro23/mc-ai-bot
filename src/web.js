const http = require('http')
const { MODELO_A_USAR, USE_OLLAMA, OLLAMA_MODEL } = require('./config')

function startWebServer() {
    const modeloActual = USE_OLLAMA ? `OLLAMA (${OLLAMA_MODEL})` : `GOOGLE (${MODELO_A_USAR})`
    
    const webServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`Bot Pollovis ONLINE. Cerebro: ${modeloActual}`)
    })
    webServer.listen(8080, '0.0.0.0', () => console.log('✅ Web Server OK (8080)'))
}

module.exports = { startWebServer }