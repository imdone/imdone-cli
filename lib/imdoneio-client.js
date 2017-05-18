const noCache = require('superagent-no-cache')
const request = require('superagent')
const async = require('async')
const authUtil = require('./auth-util')
const Emitter = require('events')
const _ = require('lodash')
const config = require('./config')
const gitInfo = require('git-repo-info')
const debug = require('debug')
const log = debug('imdone-atom:client')
const Preferences = require('preferences')

const PROJECT_ID_NOT_VALID_ERR = new Error('Project ID not valid')
const NO_RESPONSE_ERR = new Error('No response from imdone.io')
const AUTH_FAILED_ERR = new Error('authentication-failed')
let { baseUrl } = config
let baseAPIUrl = `${baseUrl}/api/1.0`
let projectsUrl = `${baseUrl}/account/projects`
let plansUrl = `${baseUrl}/plans`
let githubAuthUrl = `${baseUrl}/auth/github`
let prefs = new Preferences('imdone-cli')

module.exports = class ImdoneioClient extends Emitter {
  constructor () {
    super(...arguments)
    this.PROJECT_ID_NOT_VALID_ERR = PROJECT_ID_NOT_VALID_ERR
    this.AUTH_FAILED_ERR = AUTH_FAILED_ERR
    this.baseUrl = baseUrl
    this.baseAPIUrl = baseAPIUrl
    this.projectsUrl = projectsUrl
    this.plansUrl = plansUrl
    this.githubAuthUrl = githubAuthUrl
    this.authenticated = false
    this.connectionAccepted = false
    this.authRetryCount = 0
  }

  static get ERRORS () {
    return {
      ECONNREFUSED: { code: 'ECONNREFUSED', msg: 'imdone.io is not available.  Check you\'re network connection or contact support'}
    }
  }

  init (email, password) {
    if (email && password) {
      this.email = email
      this.password = authUtil.sha(password)
      this.saveCredentials()
    }
    this.attemptAuth()
  }

  attemptAuth () {
    async.until(() => this.connectionAccepted || this.authenticated,
      cb => {
        return setTimeout(() => {
          return this.authFromStorage(err => {
            if (err === AUTH_FAILED_ERR) {
              this.connectionAccepted = true
              this.emit(AUTH_FAILED_ERR.message)
              return cb(err)
            }
            if (err && this.connectionAccepted) {
              this.emit(AUTH_FAILED_ERR.message)
              return cb(err)
            }
            return cb()
          })
        }
        , 2000)
      })
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
        if ((err.code === ImdoneioClient.ERRORS.ECONNREFUSED.code) && this.authenticated) {
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

  doDelete (path) {
    return this.setHeaders(request.delete(`${baseAPIUrl}${path}`))
  }

  _auth (cb) {
    process.nextTick(() => {
      if (this.user) { return cb(null, this.user) }
      this.authenticating = true
      this.getAccount((err, user) => {
        if (user && user.err) { ({ err } = user) }
        if (err) { return this.onAuthFailure(err, null, cb) }
        this.user = user
        if (!user || !user.profile) { return this.onAuthFailure(new Error('User is null'), null, cb) }
        this.onAuthSuccess(user)
        cb(null, user)
        delete this.authenticating
      })
    })
  }

  logoff () {
    this.removeCredentials()
    this.authenticated = false
    delete this.password
    delete this.email
    delete this.user
  }

  authFromStorage (cb) {
    if (!cb) cb = function () {}
    // return cb new Error('Auth from stoage failed') if @storageAuthFailed
    if (this.user) return cb(null, this.user)
    this.loadCredentials()
    if (!this.user) return cb(new Error('unauthenticated'))
    this._auth((err, user) => {
      if (err) return cb(err)
      cb(null, user)
    })
  }

  onAuthSuccess (user) {
    if (this.authenticated) return
    this.authenticated = true
    this.authRetryCount = 0
    this.emit('authenticated')
    this.saveCredentials()
    this.storageAuthFailed = false
  }

  onAuthFailure (err, res, cb) {
    let status = (err.imdone_status = err && ((err.code === 'ECONNREFUSED') || (_.get(err, 'response.err.status') === 404)) ? 'unavailable' : 'failed')
    if (status !== 'unavailable') { this.connectionAccepted = true }
    this.authenticated = false
    console.log(err)
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

  saveCredentials () {
    prefs.key = authUtil.toBase64(`${this.email}:${this.password}`)
  }

  loadCredentials () {
    if (!prefs.key) return
    let parts = authUtil.fromBase64(prefs.key).split(':')
    this.email = parts[0]
    this.password = parts[1]
  }

  removeCredentials () { delete prefs.key }

  // API methods -------------------------------------------------------------------------------------------------------
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
    console.log(`Creating project for repo: ${repo.getPath()}`)
    console.log(`With config ${repo.config}`)
    this.doPost('/projects').send({
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
  }

  deleteProject (repo, cb) {
    this.doDelete(`/projects/${this.getProjectId(repo)}`).end((err, res) => {
      if (err) return cb(err)
      if (!res.ok) return cb(new Error('Failed to delete project'))
      delete repo.config.sync
      return repo.saveConfig(err => cb(err))
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
    let gitRepo = gitInfo(repo.getPath())
    let taskIds = _.map(tasks, (task) => _.get(task, 'meta.id[0]'))
    let data = {
      taskIds: taskIds,
      branch: gitRepo && gitRepo.branch
    }
    return this.doPost(`/projects/${projectId}/taskIds`).send(data).end((err, res) => {
      if (err && (err.code === 'ECONNREFUSED') && this.authenticated) {
        this.emit('unavailable')
        delete this.authenticated
        delete this.user
      }
      if (err) { return cb(err) }
      return cb(err, res.body)
    })
  }
}
