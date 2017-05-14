const _ = require('lodash')
const Repo = require('imdone-core/lib/repository')
const Client = require('./imdoneio-client')
const ImdoneioFsStore = require('./imdone-io-fs-store')

var repos = []

module.exports = {
  client: new Client(),
  add: function (dir, cb) {
    if (this.get(dir)) throw new Error('Duplicate Repository Error')
    var repo = new ImdoneioFsStore(new Repo(dir), this.client)
    repo.init(cb)
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
