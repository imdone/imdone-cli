const engine = require('engine.io')
const program = require('commander').parse(process.argv)
const repoManager = require('./repo-manager')
const _ = require('lodash')

if (!program.args || program.args.length < 1) process.exit(2)

const PORT = parseInt(program.args[0])

const server = engine.listen(PORT)

const commands = {
  doList: function (request, cb) { // eslint-disable-line
    var response = _.map(repoManager.getAll(), 'path').join('\n')
    cb(null, response)
  },
  doAdd: function (request, cb) { // eslint-disable-line
    cb(null, repoManager.add(request.path))
  },
  doRemove: function (request, cb) { // eslint-disable-line
    cb(null, repoManager.remove(request.path))
  }
}

function handleRequest (request, cb) {
  let funcName = `do${toTitleCase(request.cmd)}`
  commands[funcName](request, cb)
}

function toTitleCase (str) {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  })
}
server.on('connection', function (socket) {
  socket.on('message', function (data) {
    console.log(`imdone-service received request: ${data}`)
    let request = JSON.parse(data)
    handleRequest(request, function (err, response) {
      if (err) return socket.send(err)
      socket.send(JSON.stringify(response))
    })
    let result = {request, response: 'DONE'}
    socket.send(JSON.stringify(result))
    // TODO it should respond to add, remove and list requests
    // TODO it should respond to isAuthenticated requests
  })
})
