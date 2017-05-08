'use strict'

const request = require('superagent')
const noCache = require('superagent-no-cache')
const async = require('async')
const authUtil = require('./auth-util')
const Emitter = require('events')
const _ = require('lodash')
const config = require('./config')
const gitInfo = require('git-repo-info')
const debug = require('debug')
const log = debug('imdone-atom:client')
const PROJECT_ID_NOT_VALID_ERR = new Error('Project ID not valid')
const NO_RESPONSE_ERR = new Error('No response from imdone.io')
const USER_NOT_FOUND_ERR = new Error('User not found')
let { baseUrl } = config
let baseAPIUrl = `${baseUrl}/api/1.0`
let projectsUrl = `${baseUrl}/account/projects`
let plansUrl = `${baseUrl}/plans`
let githubAuthUrl = `${baseUrl}/auth/github`
let instance = null

module.exports = class ImdoneioClient extends Emitter {
  constructor () {
    super(...arguments)
    if (instance) return instance
    async.until(() => this.connectionAccepted || this.authenticated,
      cb => {
        return setTimeout(() => {
          return this.authFromStorage(err => {
            if (err === USER_NOT_FOUND_ERR) {
              this.connectionAccepted = true
              this.emit('unauthenticated')
              return cb(err)
            }
            if (err && this.connectionAccepted) {
              this.emit('unauthenticated')
              return cb(err)
            }
            return cb()
          })
        }
        , 2000)
      })
    this.PROJECT_ID_NOT_VALID_ERR = PROJECT_ID_NOT_VALID_ERR
    this.USER_NOT_FOUND_ERR = USER_NOT_FOUND_ERR
    this.baseUrl = baseUrl
    this.baseAPIUrl = baseAPIUrl
    this.projectsUrl = projectsUrl
    this.plansUrl = plansUrl
    this.githubAuthUrl = githubAuthUrl
    this.prototype.authenticated = false
    this.prototype.connectionAccepted = false
    this.prototype.authRetryCount = 0
    instance = this
  }

  static getInstance () {
    return new ImdoneioClient()
  }

  setHeaders (req) {
    log('setHeaders:begin')
    let withHeaders = req.set('Date', (new Date()).getTime())
      .set('Accept', 'application/json')
      .set('Authorization', authUtil.getAuth(req, 'imdone', this.email, this.password, config.imdoneKeyB, config.imdoneKeyA))
      .timeout(20000)
      .use(noCache)
      .on('error', err => {
        // console.log 'Error on request to imdone.io:', err
        if ((err.code === 'ECONNREFUSED') && this.authenticated) {
          this.emit('unavailable')
          delete this.authenticated
          return delete this.user
        }
      })

    log('setHeaders:end')
    return withHeaders
  }

  // TODO: If we get a forbidden error, then emit auth failure. id:26 gh:116
  doGet (path) {
    return this.setHeaders(request.get(`${baseAPIUrl}${path || ''}`))
  }

  doPost (path) {
    return this.setHeaders(request.post(`${baseAPIUrl}${path}`))
  }

  doPatch (path) {
    return this.setHeaders(request.patch(`${baseAPIUrl}${path}`))
  }

  doPut (path) {
    return this.setHeaders(request.put(`${baseAPIUrl}${path}`))
  }

  _auth (cb) {
    return process.nextTick(() => {
      if (this.user) { return cb(null, this.user) }
      this.authenticating = true
      return this.getAccount((err, user) => {
        if (user && user.err) { ({ err } = user) }
        if (err) { return this.onAuthFailure(err, null, cb) }
        this.user = user
        if (!user || !user.profile) { return this.onAuthFailure(new Error('User is null'), null, cb) }
        this.onAuthSuccess(user, cb)
        return delete this.authenticating
      })
    })
  }

  logoff () {
    return this.removeCredentials(err => {
      if (err) { return }
      this.authenticated = false
      delete this.password
      delete this.email
      delete this.user
      return this.emit('unauthenticated')
    })
  }

  authFromStorage (cb) {
    if (!cb) cb = function () {}
    // return cb new Error('Auth from stoage failed') if @storageAuthFailed
    if (this.user) return cb(null, this.user)
    return this.loadCredentials(err => {
      if (err) { return cb(err) }
      return this._auth((err, user) => {
        if (err) { log('Authentication err:', err) }
        // @storageAuthFailed = _.get err, 'imdone_status'
        // TODO: if err.status == 404 we should show an error id:27
        return cb(err, user)
      })
    })
  }

  onAuthSuccess (user, cb) {
    if (this.authenticated) { return cb(null, user) }
    this.authenticated = true
    this.authRetryCount = 0
    this.emit('authenticated')
    return this.saveCredentials(err => {
      if (err) return cb(err)
      this.storageAuthFailed = false
      cb(null, user)
      log('onAuthSuccess')
      return this.handlePushEvents()
    })
  }

  onAuthFailure (err, res, cb) {
    let status = (err.imdone_status = err && ((err.code === 'ECONNREFUSED') || (_.get(err, 'response.err.status') === 404)) ? 'unavailable' : 'failed')
    if (status !== 'unavailable') { this.connectionAccepted = true }
    this.authenticated = false
    this.emit('authentication-failed', {
      retries: this.authRetryCount,
      status
    })
    this.authRetryCount++
    delete this.password
    delete this.email
    return cb(err, res)
  }

  authenticate (email, password, cb) {
    this.email = email
    log('authenticate:start')
    this.password = authUtil.sha(password)
    return this._auth(cb)
  }

  isAuthenticated () { return this.authenticated }

  saveCredentials (cb) {
    return this.removeCredentials(err => {
      log('saveCredentials')
      if (err) { return cb(err) }
      let key = authUtil.toBase64(`${this.email}:${this.password}`)
      return this.db().insert({key}, cb)
    })
  }

  loadCredentials (cb) {
    return this.db().findOne({}, (err, doc) => {
      if (err) { return cb(err) }
      if (!doc) { return cb(USER_NOT_FOUND_ERR) }
      let parts = authUtil.fromBase64(doc.key).split(':')
      this.email = parts[0]
      this.password = parts[1]
      return cb(null)
    })
  }

  removeCredentials (cb) { return this.db().remove({}, { multi: true }, cb) }

  // API methods -------------------------------------------------------------------------------------------------------
  inviteToProject (repo, invited) {
    return this.doPost('/projects/')
  }

  getProducts (projectId, cb) {
    return this.doGet(`/projects/${projectId}/products`).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  getAccount (cb) {
    log('getAccount:start')
    return this.doGet('/account').end((err, res) => {
      log('getAccount:end')
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  getProject (projectId, cb) {
    return this.doGet(`/projects/${projectId}`).end((err, res) => {
      if (!res) { return cb(NO_RESPONSE_ERR) }
      if (err && (err.status === 404)) { return cb(PROJECT_ID_NOT_VALID_ERR) }
      if (res.body && (res.body.kind === 'ObjectId') && (res.body.name === 'CastError')) { return cb(PROJECT_ID_NOT_VALID_ERR) }
      if (err) { return cb(err) }
      return cb(null, res.body)
    })
  }

  updateProject (project, cb) {
    return this.doPatch(`/projects/${project.id}`).send(project).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  updateTaskOrder (projectId, order, cb) {
    return this.doPut(`/projects/${projectId}/order`).send(order).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  getIssue (connector, number, cb) {
    // TODO: We have to be better about communicating errors from connector api response such as insufficient permissions with github id:32 gh:116
    return this.doGet(`/projects/${connector._project}/connectors/${connector.id}/issues/${number}`).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  findIssues (connector, query, cb) {
    return this.doGet(`/projects/${connector._project}/connectors/${connector.id}/issues/search/?q=${query}`).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  newIssue (connector, issue, cb) {
    return this.doPost(`/projects/${connector._project}/connectors/${connector.id}/issues`).send(issue).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  createConnector (repo, connector, cb) {
    let projectId = this.getProjectId(repo)
    if (!projectId) return cb(new Error('project must have a sync.id to connect'))

    return this.doPost(`/projects/${projectId}/connectors`).send(connector).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  updateConnector (repo, connector, cb) {
    let projectId = this.getProjectId(repo)
    if (!projectId) return cb(new Error('project must have a sync.id to connect'))

    return this.doPatch(`/projects/${projectId}/connectors/${connector.id}`).send(connector).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  enableConnector (repo, connector, cb) {
    return this._connectorAction(repo, connector, 'enable', cb)
  }

  disableConnector (repo, connector, cb) {
    return this._connectorAction(repo, connector, 'disable', cb)
  }

  _connectorAction (repo, connector, action, cb) {
    let projectId = this.getProjectId(repo)
    if (!projectId) { return cb(new Error('project must have a sync.id to connect')) }
    return this.doPost(`/projects/${projectId}/connectors/${connector.id}/${action}`).end((err, res) => {
      if (err || !res.ok) { return cb(err, res) }
      return cb(null, res.body)
    })
  }

  createProject (repo, cb) {
    return process.nextTick(() => {
      return this.doPost('/projects').send({
        name: repo.getDisplayName(),
        localConfig: repo.config.toJSON()
      }).end((err, res) => {
        if (err || !res.ok) { return cb(err, res) }
        let project = res.body
        this.setProjectId(repo, project.id)
        this.setProjectName(repo, project.name)
        this.setSortConfig(repo)
        return repo.saveConfig(err => cb(err, project))
      })
    })
  }

  getProjectId (repo) { return _.get(repo, 'config.sync.id') }
  setProjectId (repo, id) { return _.set(repo, 'config.sync.id', id) }
  setSortConfig (repo) {
    _.set(repo, 'config.sync.useImdoneioForPriority', true)
    return _.set(repo, 'config.keepEmptyPriority', true)
  }
  getProjectName (repo) { return _.get(repo, 'config.sync.name') }
  setProjectName (repo, name) { return _.set(repo, 'config.sync.name', name) }

  syncTasks (repo, tasks, cb) {
    let gitRepo = gitInfo(repo.getPath())
    let projectId = this.getProjectId(repo)
    let chunks = _.chunk(tasks, 20)
    let modifiedTasks = []
    let total = 0
    log(`Sending ${tasks.length} tasks to imdone.io`)
    repo.emit('sync.percent', 0)
    return async.eachOfLimit(chunks, 2, (chunk, i, cb) => {
      log(`Sending chunk ${i}:${chunks.length} of ${chunk.length} tasks to imdone.io`)
      let data = {
        tasks: chunk,
        branch: gitRepo && gitRepo.branch
      }
      return setTimeout(() => { // Not sure why, but this sometimes hangs without using setTimeout
        this.doPost(`/projects/${projectId}/tasks`).send(data).end((err, res) => {
          // console.log 'Received Sync Response #{i} err:#{err}'
          if (err && (err.code === 'ECONNREFUSED') && this.authenticated) {
            // console.log 'Error on syncing tasks with imdone.io', err
            this.emit('unavailable')
            delete this.authenticated
            delete this.user
          }
          if (err) { return cb(err) }
          data = res.body
          modifiedTasks.push(data)
          total += data.length
          repo.emit('sync.percent', Math.ceil((total / tasks.length) * 100))
          log(`Received ${i}:${chunks.length} ${total} tasks from imdone.io`)
          return cb()
        })
        return log(`Chunk ${i}:${chunks.length} of ${chunk.length} tasks sent to imdone.io`)
      }
      , 10)
    }
    , function (err) {
      if (err) { return cb(err) }
      return cb(err, _.flatten(modifiedTasks))
    })
  }

  syncTasksForDelete (repo, tasks, cb) {
    let projectId = this.getProjectId(repo)
    let taskIds = _.map(tasks, task => task.meta.id[0])
    return this.doPost(`/projects/${projectId}/taskIds`).send({taskIds}).end((err, res) => {
      if (err && (err.code === 'ECONNREFUSED') && this.authenticated) {
        this.emit('unavailable')
        delete this.authenticated
        delete this.user
      }
      if (err) { return cb(err) }
      return cb(err, res.body)
    })
  }

  db (collection) {
    let path = require('path')
    if (arguments.length > 1) { collection = path.join.apply(this, arguments) }
    if (!collection) { collection = 'config' }
    if (!this.datastore) { this.datastore = {} }
    if (this.datastore[collection]) { return this.datastore[collection] }
    let DataStore = require('nedb')
    this.datastore[collection] = new DataStore({
      filename: path.join(require('os').homedir(), '.imdone', 'storage', 'imdone-atom', collection),
      autoload: true
    })
    return this.datastore[collection]
  }

  tasksDb (repo) {
    return this.db('tasks', repo.getPath().replace(/\//g, '_'))
  }

  listsDb (repo) {
    return this.db('lists', repo.getPath().replace(/\//g, '_'))
  }
}
