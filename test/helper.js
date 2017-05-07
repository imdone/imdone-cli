'use strict'

const fs = require('fs.extra')
const path = require('path')
const _ = require('lodash')
const defaultDataDir = path.join(__dirname, 'data')
const baseTempDir = path.join(__dirname, '..', 'temp')
const defaultTempDir = path.join(baseTempDir, 'default-test-repo')

module.exports = {
  TEMP_DIR: baseTempDir,
  newTestDataDir: (tempDir, dataDir, cb) => {
    if (_.isFunction(dataDir)) {
      cb = dataDir
      dataDir = defaultDataDir
    } else if (_.isFunction(tempDir)) {
      cb = tempDir
      dataDir = defaultDataDir
      tempDir = defaultTempDir
    }

    fs.rmrf(tempDir, (err) => {
      if (err) return cb(err)
      fs.copyRecursive(dataDir, tempDir, (err) => {
        if (err) return cb(err)
        cb(null, tempDir)
      })
    })
  },
  getTempDir: (name) => {
    return path.join(baseTempDir, name)
  }
}
