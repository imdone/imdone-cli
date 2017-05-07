#!/usr/bin/env node
'use strict'

const pkg = require('./package.json')
const program = require('commander')

program.version(pkg.version)
  .command('add [path]', 'Start syncing project at path', {isDefault: true})
  .command('remove [path]', 'Stop syncing project at path')
  .command('list', 'List projects being synced with imdone.io')
  .parse(process.argv)
