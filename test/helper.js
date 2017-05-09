'use strict'

const fs = require('fs.extra')
const path = require('path')
const _ = require('lodash')
const Repo = require('imdone-core/lib/repository')
const repoFSStore = require('imdone-core/lib/mixins/repo-fs-store')
const defaultDataDir = path.join(__dirname, 'data')
const baseTempDir = path.join(__dirname, '..', 'temp')
const defaultTempDir = path.join(baseTempDir, 'default-test-repo')

module.exports = {
  TEMP_DIR: baseTempDir,
  newTestDataDir: function (tempDir, dataDir, cb) {
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
  getTempDir: function (name) {
    return path.join(baseTempDir, name)
  },
  initRepoAtDir: function (name, cb) {
    this.newTestDataDir(this.getTempDir('createProject-test'), (err, testDir) => {
      if (err) return cb(err)
      let repo = repoFSStore(new Repo(testDir))
      repo.on('initialized', (data) => {
        cb(null, repo)
      })
      repo.init()
    })
  }
}
