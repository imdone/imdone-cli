const engine = require('engine.io')
const repoManager = require('./repo-manager')
const _ = require('lodash')
const PORT = process.env.PORT
const server = engine.listen(PORT)
const BAD_REQUEST = 'Bad Request'
const log = require('debug')('imdone-service')

const commands = {
  doList: function (request, cb) { // eslint-disable-line
    let repos = repoManager.getAll()
    let response = (repos.length === 0) ?
      {status: 'show.help', msg: ['You\'re not syncing any TODO comments with your issue tracking or project managment tools.']} :
      {msg: _.map(repos, 'path')}
    cb(null, response)
  },
  doAdd: function (request, cb) { // eslint-disable-line
    repoManager.add(request.param, (err, repo) => {
      // TODO: Handle Payment Required
      if (err) return cb(err)
      cb(null, {msg: [repo.getPath()]})
    })
  },
  doRemove: function (request, cb) { // eslint-disable-line
    let repo = repoManager.remove(request.param)
    if (!repo) return cb(new Error())
    cb(null, {msg:[repo.getPath()]})
  },
  doLogoff: function (request, cb) { // eslint-disable-line
    repoManager.client.logoff()
    cb(null, {status: 'unauthenticated'})
  },
  doLogon: function (request, cb) {
    // DOING: should try to call client.authFromStorage first
    repoManager.client.authenticate(request.email, request.password, (err, user) => {
      if (err) return cb(err)
      if (user && user.id) return cb(null, {status: 'authenticated'})
      cb(new Error('Authentication Error'))
    })
  }
}

function handleRequest (request, cb) {
  if (!request || !request.cmd) return cb(new Error(BAD_REQUEST))
  let funcName = `do${toTitleCase(request.cmd)}`
  let func = commands[funcName]
  if (!func) return cb(new Error(BAD_REQUEST))
  if (repoManager.client.isAuthenticated()) return func(request, cb)
  repoManager.client.authFromStorage((err, user) => {
    log(`Done with authFromStorage:`)
    return func(request, cb)
  })
}

function toTitleCase (str) {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  })
}

server.on('connection', function (socket) {

  socket.on('message', function (data) {
    log(`imdone-service received request: ${data}`)
    let request = JSON.parse(data)

    handleRequest(request, function (err, msg) {
      if (!msg) msg = {}
      if (err && err.code) msg = {status: err.code, err: err.code}
      else if (err) msg = {status: err.message, err: err.message}

      log(JSON.stringify(msg))
      socket.send(JSON.stringify(msg))
    })
    // TODO it should respond to isAuthenticated requests id:4
  })
})
