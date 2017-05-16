const engine = require('engine.io')
const repoManager = require('./repo-manager')
const _ = require('lodash')
const PORT = process.env.PORT || 49153
const server = engine.listen(PORT)

const commands = {
  doList: function (request, cb) { // eslint-disable-line
    cb(null, _.map(repoManager.getAll(), 'path'))
  },
  doAdd: function (request, cb) { // eslint-disable-line
    repoManager.add(request.param, (err, repo) => {
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
    repoManager.client.logoff(cb)
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
    // TODO it should respond to isAuthenticated requests id:4
  })
})
