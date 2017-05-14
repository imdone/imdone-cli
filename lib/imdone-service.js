const engine = require('engine.io')
const program = require('commander').parse(process.argv)

if (!program.args || program.args.length < 1) process.exit(2)

const PORT = parseInt(program.args[0])

const server = engine.listen(PORT)

server.on('connection', function (socket) {
  socket.on('message', function (data) {
    let request = JSON.parse(data)
    let result = {request, response: 'DONE'}
    socket.send(JSON.stringify(result))
    // TODO it should respond to add, remove and list requests
    // TODO it should respond to isAuthenticated requests
  })
})
