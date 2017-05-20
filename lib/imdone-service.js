const engine = require('engine.io')
const repoManager = require('./repo-manager')
const _ = require('lodash')
const PORT = process.env.PORT
const server = engine.listen(PORT)

const commands = {
  doList: function (request, cb) { // eslint-disable-line
    cb(null, _.map(repoManager.getAll(), 'path'))
  },
  doAdd: function (request, cb) { // eslint-disable-line
    repoManager.add(request.param, (err, repo) => {
      // TODO: Handle Payment Required
      if (err) return cb(err)
      cb(null, [repo.getPath()])
    })
  },
  doRemove: function (request, cb) { // eslint-disable-line
    let repo = repoManager.remove(request.param)
    if (!repo) return cb(new Error())
    cb(null, [repo.getPath()])
  },
  doLogoff: function (request, cb) { // eslint-disable-line
    repoManager.client.logoff()
    cb(null, ['unauthenticated'])
  },
  doLogon: function (request, cb) {
    repoManager.client.authenticate(request.email, request.password, (err, user) => {
      if (err) return cb(err)
      if (user && user.id) return cb(null, ['authenticated'])
      cb(new Error('Authentication Error'))
    })
  }
}

function handleRequest (request, cb) {
  if (!request || !request.cmd) return cb(new Error('Bad Request'))
  let funcName = `do${toTitleCase(request.cmd)}`
  let func = commands[funcName]
  if (!func) return cb(new Error('Bad requests'))
  func(request, cb)
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
    handleRequest(request, function (err, msg) {
      var status = ''
      if (err && err.code) status = err = err.code
      else if (err) status = err = err.message
      else if (msg && msg.length > 0) status = msg[0]

      console.log(JSON.stringify({ err, msg, status }))
      socket.send(JSON.stringify({ err, msg, status }))
    })
    // TODO it should respond to isAuthenticated requests id:4
  })
})
