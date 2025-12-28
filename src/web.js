const http = require('http')
const { MODELO_A_USAR } = require('./config')

function startWebServer() {
    const webServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`Bot Pollovis ONLINE. Modelo: ${MODELO_A_USAR}`)
    })
    webServer.listen(8080, '0.0.0.0', () => console.log('✅ Web Server OK (8080)'))
}

module.exports = { startWebServer }