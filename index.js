#!/usr/bin/env node
'use strict'

const pkg = require('./package.json')
const program = require('commander')
const pm2 = require('pm2')
const eio = require('engine.io-client')
const PORT = 49153
const NAME = 'imdone-service'

program.version(pkg.version)
  .option('add [path]', 'Start syncing project at path')
  .option('remove [path]', 'Stop syncing project at path')
  .option('list', 'List projects being synced with imdone.io')
  .parse(process.argv)

let cmd = program.args[0]
let path = program[cmd]

function processCommand () {
  var socket = eio(`ws://localhost:${PORT}`, {
    requestTimeout: 2000,
    forceNode: true
  })

  socket.on('error', function () {
    setTimeout(() => socket.open(), 1000)
  })

  socket.on('open', function () {
    console.log('connection established with imdone service')
    socket.on('message', function (data) {
      let msg = JSON.parse(data)
      console.log(`message received: ${data}`)
      socket.close()
    })
    socket.on('close', function () {
      process.exit(1)
    })
    socket.send(JSON.stringify({cmd, path}))
  })
}

function error (err) {
  console.error(err)
  process.exit(2)
}

pm2.connect(function (err) {
  if (err) error(err)

  if (cmd === 'stop') {
    pm2.killDaemon(function () {
      process.exit(1)
    })
    return
  }

  pm2.list(function (err, list) {
    if (err) error()
    if (list.length > 0) return processCommand()
    // TODO: The imdone.io service accept a port so we can display it later
    pm2.start({
      script: `./lib/imdone-service.js`,
      args: `${PORT}`,
      name: NAME
    }, function (err, apps) {
      if (err) error(err)
      console.log(`the imdone service is now running on port ${PORT}`)
      processCommand()
    })
  })
})
