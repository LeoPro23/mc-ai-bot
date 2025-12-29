const http = require('http')
const { MODELO_A_USAR, USE_OLLAMA, OLLAMA_MODEL, USE_GROQ, GROQ_MODEL } = require('./config')

function startWebServer() {
    let modeloActual = `GOOGLE (${MODELO_A_USAR})`
    if (USE_GROQ) modeloActual = `GROQ (${GROQ_MODEL})`
    else if (USE_OLLAMA) modeloActual = `OLLAMA (${OLLAMA_MODEL})`
    
    const webServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`Bot Pollovis ONLINE. Cerebro: ${modeloActual}`)
    })
    webServer.listen(8080, '0.0.0.0', () => console.log('✅ Web Server OK (8080)'))
}

module.exports = { startWebServer }