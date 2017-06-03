const _ = require('lodash')
const Repo = require('imdone-core/lib/repository')
const Client = require('./imdoneio-client')
const imdoneioFsStore = require('./imdone-io-fs-store')
const Configstore = require('configstore')
const prefs = new Configstore('imdone-repo-manager', {repos:[]})
var client = new Client()
var repos = []

function repoIsRunning(path) {
  return _.find(repos, {path: path})
}

function saveRepo(repo) {
  if (!mgr.get(repo.path)) {
    repos.push(repo)
    prefs.set('repos',_.map(repos, 'path'))
  }
}

var mgr = module.exports = {
  client,
  // TODO It should save the repos in the db for restart id:14
  doAdd (dir, cb) {
    if (this.get(dir)) return cb(new Error('Duplicate Repository Error'))
    var repo = imdoneioFsStore(new Repo(dir), client)
    repo.loadConfig((err, config) => {
      repo.config = config
      if (err) return cb(err)
      repo.checkForIIOProject((err, project) => {
        if (err && err.message === repo.PROJECT_NOT_FOUND) {
          client.createProject(repo, (err, project) => {
            if (err) return cb(err)
            repo.init( () => {
              saveRepo(repo)
              cb(null, repo)
            })
          })
        } else if (err) {
          return cb(err)
        } else {
          repo.init(function () {
            saveRepo(repo)
            cb(null, repo)
          })
        }
      })
    })
    return repo
  },
  add: function (dir, cb) {
    if (client.isAuthenticated()) return this.doAdd(dir, cb)
    client.authFromStorage((err) => {
      if (err) return cb(new Error('unauthenticated'))
      this.doAdd(dir, cb)
    })
  },
  get: function (dir) {
    return _.find(repos, {path: dir})
  },
  getAll: function () {
    return repos
  },
  remove: function (dir) {
    this.get(dir).destroy()
    var result = _.remove(repos, {path: dir})[0]
    prefs.set('repos',_.map(repos, 'path'))
    return result
  },
  removeAll: function () {
    repos = []
  }
}

prefs.get('repos').forEach(function(path) {
  mgr.add(path, (err) => {
    if (err) console.log(err)
  })
})
