const _ = require('lodash')
const Repo = require('imdone-core/lib/repository')
const Client = require('./imdoneio-client')
const ImdoneioFsStore = require('./imdone-io-fs-store')

var repos = []
var client = new Client()
module.exports = {
  client: client,
  add: function (dir, cb) {
    if (!client.isAuthenticated()) return cb(new Error('unauthenticated'))
    if (this.get(dir)) return cb(new Error('Duplicate Repository Error'))
    let repo = new ImdoneioFsStore(new Repo(dir), this.client)
    repo.loadConfig((err, config) => {
      repo.config = config
      if (err) return cb(err)
      repo.checkForIIOProject(function (err, project) {
        if (err && err.message === repo.PROJECT_NOT_FOUND) {
          client.createProject(repo, (err, project) => {
            if (err) return cb(err)
            repo.init(function () {
              repos.push(repo)
              cb(null, project)
            })
          })
        } else if (err) {
          return cb(err)
        } else {
          repo.init(function () {
            repos.push(repo)
            cb(null, project)
          })
        }
      })
    })
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
