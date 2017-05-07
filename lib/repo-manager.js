'use strict'

const _ = require('lodash')
const Repo = require('imdone-core/lib/repository')
const FsStore = require('imdone-core/lib/mixins/repo-watched-fs-store')
var repos = []
module.exports = {
  add: function (dir) {
    if (this.get(dir)) throw new Error('Duplicate Repository Error')
    var repo = new FsStore(new Repo(dir))
    repo.init()
    repos.push(repo)
    return repo
  },
  get: function (dir) {
    return _.find(repos, {path: dir})
  },
  getAll: function () {
    return repos
  },
  remove: function (dir) {
    return _.remove(repos, {path: dir})[0]
  },
  removeAll: function () {
    repos = []
  }
}
