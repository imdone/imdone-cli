const engine = require('engine.io')
const program = require('commander').parse(process.argv)
const repoManager = require('./repo-manager')
const _ = require('lodash')

if (!program.args || program.args.length < 1) process.exit(2)

const PORT = parseInt(program.args[0])

const server = engine.listen(PORT)

const commands = {
  doList: function (request, cb) { // eslint-disable-line
    cb(null, _.map(repoManager.getAll(), 'path'))
  },
  doAdd: function (request, cb) { // eslint-disable-line
    var repo = repoManager.add(request.path)
    repo.on('unavailable', () => cb(new Error('unavailable')))
    repo.on('unauthenticated', () => cb(new Error('unauthenticated')))
    repo.on('authentication-failed', () => cb(new Error('authentication-failed')))
    repo.on('project.not-found', () => cb(new Error('project.not-found')))
  },
  doRemove: function (request, cb) { // eslint-disable-line
    let repo = repoManager.remove(request.path)
    cb(null, [repo.getPath()])
  },
  doLogoff: function (request, cb) { // eslint-disable-line
    // TODO it should be able to logoff
    repoManager.client.on('unauthenticated', () => cb(new Error('unauthenticated')))
    repoManager.client.logoff()
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
      if (err) response = [err.message]
      console.log(JSON.stringify(response))
      socket.send(JSON.stringify(response))
    })
    // TODO it should respond to isAuthenticated requests
  })
})
