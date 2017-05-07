#!/usr/bin/env node
'use strict'

const pkg = require('../package.json')
const program = require('commander')

program.version(pkg.version)
  .command('-n, --name [name]', 'Use project name instead of path')
  .parse(process.argv)
