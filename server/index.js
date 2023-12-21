const express = require('express')
const path = require('path')
const { v4: uuidV4 } = require('uuid')

const SERVER_PORT = 8080

const POLLING_INTERVAL_MS = 250
const RESPONSE_TIMEOUT_MS = 30000

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, '../client')))
app.use(function(req, res, next) { // cors middleware
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, PUT')
    next()
});

COUNTER_FIELD = 'count'
TOTAL_COUNTER_FIELD = 'total_count'
MESSAGES_FIELD = 'messages'

class ConnectionState {
    constructor() {
        this[COUNTER_FIELD] = 0
        this[TOTAL_COUNTER_FIELD] = 0
        this[MESSAGES_FIELD] = []
    }
}

// In-memory key-value хранилище соединений
const connectionsStates = new Map() // <connectionUuid: String, state: ConnectionState>


app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')))

app.post('/connect', (req, res) => {
    try {
        const { syn } = req.body
        console.log(`got syn: ${syn}`)
        if (!syn || isNaN(syn)) { 
            return res.status(400).json({ message: `Невалидный SYN: ${syn}` })
        }

        const newConnectionId = uuidV4()
        console.log(`launch connection with uuid ${newConnectionId}`)
        connectionsStates[newConnectionId] = new ConnectionState()

        const incSyn = Number(syn) + 1
        return res.status(200).json({ incSyn, newConnectionId })
    } catch (err) {
        console.log(err.message)
        return res.status(500).json({ message: `Неизвестная ошибка сервера: ${err.message}` })
    }
})

app.get('/messages', (req, res) => {
    try {
        // SLA на доступность - 95% :)
        if (Math.floor(Math.random() * 20) + 1 === 1) return

        const { connectionId, messageNumber } = req.query
        console.log(`getting messages for ${connectionId}`)
        if (!connectionId || !messageNumber) {
            return res.status(400).json({ message: 'Неверные параметры запроса' })
        }

        const connection = connectionsStates[connectionId]
        if (!connection) {
            console.log(req.query)
            return res.status(404).json({ message: 'Несуществующий id соединения' })
        }

        let pollNum = 0
        const pollInterval = setInterval(() => {
            pollNum++
            console.log(`${connectionId}: Poll #${pollNum}`)
            
            if (connection[MESSAGES_FIELD].length !== 0) {
                clearInterval(pollInterval)
                connection[COUNTER_FIELD]++

                const message = connection[MESSAGES_FIELD].pop()
                return res.json({
                    message: `${message} : ${connection[COUNTER_FIELD]}/${connection[TOTAL_COUNTER_FIELD]}`,
                    count: connection[COUNTER_FIELD],
                    total_count: connection[TOTAL_COUNTER_FIELD],
                })
            }
        }, POLLING_INTERVAL_MS)

        setTimeout(() => {
            clearInterval(pollInterval)
            if (!res.headersSent && connection[MESSAGES_FIELD].length === 0) {
                return res.json({
                    message: `Timeout - сообщений для соединения с id '${connectionId}' не найдено`,
                    count: connection[COUNTER_FIELD],
                    total_count: connection[TOTAL_COUNTER_FIELD],
                })
            }
        }, RESPONSE_TIMEOUT_MS)
    } catch (err) {
        return res.status(500).json({ message: `Неизвестная ошибка сервера: ${err.message}` })
    }
})

app.post('/messages', (req, res) => {
    try {
        const { connectionId, newMessages } = req.body
        if (!connectionId || !newMessages) {
            return res.status(400).json({ message: 'Неверное тело запроса: отсутствует connectionId (uuidv4-строка) или newMessages ([]строк)' })
        }

        console.log(`new messages for connection ${connectionId}: ${newMessages}`)

        if (!Array.isArray(newMessages)) {
            return res.status(400).json({ message: 'Сообщения должны быть в формате []строк' })
        }

        const connection = connectionsStates[connectionId]
        if (!connection) {
            return res.status(400).json({ message: `Соединение с id '${connectionId}' не найдено` })
        }

        newMessages.forEach((message) => {
            console.log(`Push "${message}"`)
            connection[MESSAGES_FIELD].push(message)
            connection[TOTAL_COUNTER_FIELD]++
        })

        res.json({ messages: connection[MESSAGES_FIELD] })
    } catch (err) {
        res.status(500).json({ message: `Неизвестная ошибка сервера: ${err.message}` })
    }
})

app.listen(SERVER_PORT, () => {
    console.log(`Server started at http://localhost:${SERVER_PORT}`)
})
