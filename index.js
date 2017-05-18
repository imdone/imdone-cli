#!/usr/bin/env node
'use strict'

const pkg = require('./package.json')
const program = require('commander')
const pm2 = require('pm2')
const eio = require('engine.io-client')
const inquirer = require('inquirer')
const path = require('path')
const ora = require('ora')()
const _ = require('lodash')
const ERRORS = require('./lib/imdoneio-client').ERRORS
const PORT = process.env.PORT = 49153
const NAME = 'imdone-service'

program.version(pkg.version)
  .option('add [path]', 'Start syncing project at path')
  .option('remove [path]', 'Stop syncing project at path')
  .option('list', 'List projects being synced with imdone.io')
  .option('stop', 'Stop watching all projects')
  .option('logoff', 'Log off of imdone.io')
  .parse(process.argv)

var cmd
if (program.add) cmd = 'add'
if (program.remove) cmd = 'remove'
if (program.list) cmd = 'list'
if (program.logoff) cmd = 'logoff'
// TODO As a user I would like to find tasks with a _.find style json query id:0 ok
if (program.stop) cmd = 'stop'
var param = program[cmd]
if (param && _.isString(param)) param = path.resolve(param)

function processCommand () {
  var socket = eio(`ws://localhost:${PORT}`, {
    requestTimeout: 2000,
    forceNode: true
  })

  function sendRequest () {
    ora.start()
    let req = JSON.stringify({cmd, param})
    socket.send(req)
  }

  function handleResponse (res) {
    if (ERRORS[res.err]) return console.log(ERRORS[res.err].msg)
    if (res.err) console.log(`ERROR: ${res.err}`)
    if (res.status) console.log(`STATUS: ${res.status}`)
    if (res.msg) res.msg.forEach((line) => console.log(line))
  }

  socket.on('error', function () {
    setTimeout(() => socket.open(), 1000)
  })

  socket.on('open', function () {
    socket.on('message', function (response) {
      ora.stop()
      response = JSON.parse(response)
      var err = response.err
      var status = response.status
      if (err === 'authentication-failed' || err === 'unauthenticated') {
        authPrompt(function (data) {
          data.cmd = 'logon'
          ora.start()
          socket.send(JSON.stringify(data))
        })
      } else if (status === 'authenticated') {
        sendRequest()
      } else {
        handleResponse(response)
        socket.close()
      }
    })
    socket.on('close', function () {
      process.exit(1)
    })
    sendRequest()
  })
}

function authPrompt (callback) {
  var questions = [
    {
      name: 'email',
      type: 'input',
      message: 'Enter your imdone.io e-mail address:',
      validate: function (value) {
        if (value.length) {
          return true
        } else {
          return 'Please enter your e-mail address'
        }
      }
    },
    {
      name: 'password',
      type: 'password',
      message: 'Enter your password:',
      validate: function (value) {
        if (value.length) {
          return true
        } else {
          return 'Please enter your password'
        }
      }
    }
  ]

  inquirer.prompt(questions).then(callback)
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
    // TODO: The imdone.io service accept a port so we can display it later id:1
    pm2.start({
      script: `./lib/imdone-service.js`,
      name: NAME
    }, function (err, apps) {
      if (err) error(err)
      console.log(`the imdone service is now running on port ${PORT}`)
      processCommand()
    })
  })
})
