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
const debug = require('debug')('imdone')
const ERRORS = require('./lib/imdoneio-client').ERRORS
const PORT = process.env.PORT || 44044
process.env.PORT = PORT
const NAME = 'imdone-service'

program.version(pkg.version)
  .option('start', 'Start imdone')
  .option('stop', 'Stop imdone')
  .option('logoff', 'Log off of imdone.io')
  .option('add [path]', 'Start syncing project at path')
  .option('remove [path]', 'Stop syncing project at path')
  .option('list', 'List projects being synced with imdone.io')
  .parse(process.argv)

if (!process.argv.slice(2).length) return program.outputHelp()

var cmd
// TODO As a user I would like to find tasks with a _.find style json query id:0 ok
program.options.forEach(function(option) {
  if (option.short) return
  if (program[option.long]) cmd = option.long
})

var param = program[cmd]
if (param && _.isString(param)) param = path.resolve(param)

pm2.connect(function (err) {
  if (err) return error(err)

  if (cmd === 'stop') {
    return pm2.killDaemon(function () {
      process.exit(1)
    })
  }

  pm2.describe(NAME, function (err, desc) {
    if (err) return error()
    pm2.start({
      script: `./lib/imdone-service.js`,
      name: NAME
    }, function (err, apps) {
      debugger
      if (err) return error(err)
      if (cmd === 'start') return
      processCommand()
    })
  })
})

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
    if (res.err === 'Bad Request') return program.outputHelp()
    if (res.err) return console.log(`ERROR: ${res.err}`)
    if (res.msg) res.msg.forEach((line) => console.log(line))
    if (res.status) {
      if (res.status === 'show.help') return program.outputHelp()
      console.log(res.status)
    }
  }

  socket.on('error', function () {
    setTimeout(() => socket.open(), 1000)
  })

  socket.on('open', function () {
    socket.on('message', function (response) {
      ora.stop()
      debug(`received response: ${response}`)
      response = JSON.parse(response)
      if (response.err === 'authentication-failed' || response.status === 'unauthenticated') {
        authPrompt(function (data) {
          data.cmd = 'logon'
          ora.start()
          socket.send(JSON.stringify(data))
        })
      } else if (response.status === 'authenticated') {
        console.log(`user authenticated, running : ${cmd} ${param}`)
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
  // TODO should make messages look better
  console.log(`Integrate TODO's where ever you choose.  Sign in to imdone.io now or create a new account at http://imdone.io.`)
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
