const express = require('express')
const path = require('path')
const { v4: uuidV4 } = require('uuid')

const SERVER_PORT = 8080

const POLLING_INTERVAL_MS = 100
const RESPONSE_TIMEOUT_MS = 30000

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, '../client')))

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
        if (!syn || isNaN(syn)) { 
            return res.status(400).json({ message: `Невалидный SYN: ${syn}` })
        }

        const newConnectionId = uuidV4()  
        connectionsStates[newConnectionId] = new ConnectionState()

        const incrementedSyn = Number(syn) + 1
        res.json({ incrementedSyn, newConnectionId })
    } catch (err) {
        return res.status(500).json({ message: `Неизвестная ошибка сервера: ${err.message}` })
    }
})

app.get('/messages', (req, res) => {
    try {
        // SLA на доступность - 95% :)
        if (Math.floor(Math.random() * 20) + 1 === 1) return

        const { connectionId, messageNumber } = req.query
        if (!connectionId || !messageNumber) {
            return res.status(400).json({ message: 'Неверные параметры запроса' })
        }

        const connection = connectionsStates[connectionId]
        if (!connection) {
            return res.status(404).json({ message: 'Несуществующий id соединения' })
        }

        let pollNum = 0
        const pollInterval = setInterval(() => {
            pollNum++
            console.log(`${connectionId}: Poll #${pollNum}`)
            
            if (connection[MESSAGES_FIELD].length !== 0) {
                clearInterval(interval)
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
                    message: `Timeout - сообщений для соеднинения с id '${connectionId}' не найдено`,
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

        if (!Array.isArray(newMessages)) {
            return res.status(400).json({ message: 'Сообщения должны быть в формате []строк' })
        }

        const connection = connectionsStates[connectionId]
        if (!connection) {
            return res.status(400).json({ message: `Соединение с id '${connectionId}' не найдено` })
        }

        for (const message in newMessages) {
            connection[MESSAGES_FIELD].push(message)
            connection[TOTAL_COUNTER_FIELD]++
        }

        res.json({ messages: connection["messages"] })
    } catch (err) {
        res.status(500).json({ message: `Неизвестная ошибка сервера: ${err.message}` })
    }
})

app.listen(SERVER_PORT, () => {
    console.log(`Server started at http://localhost:${SERVER_PORT}`)
})
