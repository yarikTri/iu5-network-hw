const list = document.getElementById('responses-list')
const startButton = document.getElementById('start-btn')
const endButton = document.getElementById('end-btn')
let isPolling = false

let messageNumber = 0
let countRequest = 1

const tcpConnect = async () => {
    try {
        const syn = Math.floor(Math.random() * 1000)
        const node = document.createElement('li')

        const resp = await fetch('/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ syn }),
        })

        if (resp.status !== 200) {
            console.error(`Ошибка (${resp.status}) при выполнении запроса: ${resp.body}`)
            node.innerText = 'Не получилось подключиться к серверу'
            list.appendChild(node)
            endServerConnection()
            return
        }

        const respBody = await resp.json()
        const respSyn = respBody.syn
        if (!respSyn) {
            return console.error(`Ошибка при подключении: ${respBody.message}`)
        }

        if (respSyn !== syn + 1 || !respBody.connectionId) {
            return console.error(`Полученный SYN - ${respSyn}, но ожидалось - ${syn + 1}`)
        }

        console.log('Успешное подключение. SYN и SYN+1 подтверждены.')
        node.innerText = 'Успешное подключение...'
        list.appendChild(node)
        subscribe(respBody.connectionId)
    } catch (error) {
        console.error('Ошибка при выполнении запроса:', error.message)
        endServerConnection()
    }
}


const subscribe = async (connectionId) => {
    try {
        const abortController = new AbortController()
        const abortSignal = abortController.signal

        const node = document.createElement('li')
        const timeout = setTimeout(() => {
            node.innerText = 'Превышено время ожидания ответа от сервера (> 31 c)'
            list.appendChild(node)
            abortController.abort()
        }, 31000)

        const resp = await fetch(`/messages?connectionId=${connectionId}&messageNumber=${messageNumber + 1}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            // body: JSON.stringify({ connectionId, messageNumber: messageNumber + 1}),
            signal: abortSignal,
        })

        clearTimeout(timeout)

        if (resp.status !== 200) {
            console.error(`Ошибка (${resp.status}) при выполнении запроса: ${resp.body}`)
            node.innerText = 'Ошибка при обращении к серверу'
            list.appendChild(node)
            endServerConnection()
            return
        }

        const respBody = await resp.json()
        countRequest = 1
        if (respBody.count === messageNumber + 1) {
            messageNumber++
            node.innerText = respBody.message
            list.appendChild(node)
            countRequest = 0

            if (isPolling) {
                subscribe(connectionId)
            }
        } else if (!isNaN(respBody.count)) {
            node.innerText = respBody.message
            list.appendChild(node)
            if (isPolling) {
                subscribe(connectionId)
            }
        }
    } catch (error) { // 2 retries
        const node = document.createElement('li')
        if (error.name !== 'AbortError') {
            node.innerText = 'Ошибка при выполнении запроса'
            list.appendChild(node)
            endServerConnection()
            return
        }

        if (countRequest > 2) {
            node.innerText = "Сервер не ответил - слишком много неудачных попыток - закрытие соединения"
            list.appendChild(node)
            endServerConnection()
            return
        }
        
        countRequest++
        node.innerText = "Сервер не ответил - повтор запроса"
        list.appendChild(node)
        if (isPolling) {
            subscribe(connectionId)
        }
    }
}

const startServerConnection = () => {
    endButton.disabled = false
    startButton.disabled = true
    isPolling = true

    tcpConnect()
}

const endServerConnection = () => {
    startButton.disabled = false
    endButton.disabled = true
    isPolling = false
}
