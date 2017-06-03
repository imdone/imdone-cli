const CONFIG_DIR = require('imdone-core/lib/constants').CONFIG_DIR
const ERRORS = require('imdone-core/lib/constants').ERRORS
const log = require('debug')('imdoneio-fs-store')
const Task = require('imdone-core/lib/task')
const fs = require('fs')
const _ = require('lodash')
const async = require('async')
const path = require('path')

module.exports = function (repo, client) {
  repo = require('imdone-core/lib/mixins/repo-watched-fs-store')(repo)
  let checkForIIOProject, syncTasks
  let SORT_FILE = repo.getFullPath(path.join(CONFIG_DIR, 'sort.json'))

  let _getTasksInList = repo.getTasksInList.bind(repo)
  let _getTasksByList = repo.getTasksByList.bind(repo)
  let _init = repo.init.bind(repo)
  let _refresh = repo.refresh.bind(repo)
  let _setTaskPriority = repo.setTaskPriority.bind(repo)
  let _moveTasks = repo.moveTasks.bind(repo)
  let _emitFileUpdate = repo.emitFileUpdate.bind(repo)
  const PROJECT_NOT_FOUND = 'project.not-found'
  repo.PROJECT_NOT_FOUND = PROJECT_NOT_FOUND

  client.on('authenticated', () => repo.emit('authenticated'))
  client.on('unauthenticated', () => repo.emit('unauthenticated'))
  client.on('authentication-failed', ({status, retries}) => repo.emit('authentication-failed', ({status, retries})))
  client.on('unavailable', () => repo.emit('unavailable'))

  repo.getProjectId = () => _.get(repo, 'config.sync.id')
  repo.setProjectId = id => _.set(repo, 'config.sync.id', id)
  repo.getProjectName = () => _.get(repo, 'config.sync.name')
  repo.setProjectName = name => _.set(repo, 'config.sync.name', name)
  repo.getClient = () => client

  // TODO: Handle the case when imdone.io is offline!  Keep a message saying offline! and auto reconnect when it's back. id:7
  repo.isReadyToSync = () => client.isAuthenticated() && repo.project && !repo.project.disabled && repo.initialized

  repo.disableProject = function (cb) {
    if (cb == null) cb = function () {}
    delete repo.config.sync
    delete repo.project
    return repo.saveConfig(err => {
      if (err) { return cb(err) }
      let tasks = repo.getTasks()
      return async.eachSeries(tasks,
        function (task, cb) {
          let currentTask = repo.getTask(task.id)
          let taskToModify = _.assign(currentTask, task)
          if (!Task.isTask(taskToModify)) { return cb(new Error('Task not found')) }
          delete taskToModify.meta.id
          return repo.modifyTask(taskToModify, cb)
        },
        err => {
          if (err) return cb(err)
          repo.saveModifiedFiles(function (err, files) {
            if (err) { return cb(err) }
            repo.emit('tasks.updated', tasks)
            repo.emit('project.removed')
            return cb()
          })
        }
      )
    })
  }

  repo.checkForIIOProject = (checkForIIOProject = function (cb) {
    // TODO This should accept a callback id:10
    cb = cb || (() => {})
    log('Checking for imdone.io project')
    if (repo.project) return cb(null, repo.project)
    if (!repo.getProjectId()) return cb(new Error(PROJECT_NOT_FOUND))
    client.getProject(repo.getProjectId(), (err, project) => {
      if (err) return cb(err)
      if (!project) return cb(new Error(PROJECT_NOT_FOUND))
        // Check account for plan type
      repo.project = project
      repo.setProjectName(project.name)
      if (!repo.isReadyToSync()) return cb(null, project)
      if (sortEnabled()) _.set(repo, 'sync.sort', project.taskOrder)
      return repo.syncTasks(repo.getTasks(), (err, done) => {
        repo.emit('project.found', project)
        done(err)
        cb(err, project)
      })
    })
  })

  if (client.isAuthenticated()) { checkForIIOProject() }
  client.on('authenticated', () => checkForIIOProject())

  let syncDone = tasks =>
    function (err) {
      if (!err) { repo.emit('tasks.updated', tasks) }
      if (err === ERRORS.NO_CONTENT) { return }
      if (err) { throw err }
    }

  repo.syncTasks = syncTasks = function (tasks, cb) {
    if (!client.isAuthenticated()) { return cb(new Error('unauthenticated'), function () {}) }
    if (!repo.getProjectId()) { return cb(new Error('not enabled')) }
    if (!_.isArray(tasks)) { tasks = [tasks] }
    if (!(tasks.length > 0)) { return cb() }

    repo.emit('tasks.syncing')
    // console.log 'sending #{tasks.length} tasks to imdone-io '
    return client.syncTasks(repo, tasks, function (err, ioTasks) {
      if (err) { return } // TODO: Do something with this error id:13
      // console.log 'received tasks from imdone-io:', ioTasks
      return async.eachSeries(ioTasks,
        function (task, cb) {
          let currentTask = repo.getTask(task.id)
          let taskToModify = _.assign(currentTask, task)
          if (!Task.isTask(taskToModify)) { return cb(new Error('Task not found')) }
          return repo.modifyTask(taskToModify, cb)
        },
        function (err) {
          if (err) {
            // console.log 'Sync Error:', err
            return repo.emit('sync.error', err)
          }
          return repo.saveModifiedFiles((err, files) => {
            if (err) return cb(err)
            client.syncTasksForDelete(repo, repo.getTasks(), function (err, deletedTasks) {
              if (!cb) { return syncDone(tasks)(err) }
              return cb(err, syncDone(tasks))
            })
          })
        })
    })
  }

  let syncFile = function (file, cb) {
    if (!client.isAuthenticated()) { return cb(new Error('unauthenticated'), () => {}) }
    if (!repo.getProjectId()) { return cb(new Error('not enabled')) }
    repo.emit('tasks.syncing')
    // console.log 'sending tasks to imdone-io for: #{file.path}'
    return client.syncTasks(repo, file.getTasks(), function (err, tasks) {
      if (err) { return } // TODO: Do something with this error id:2
      // console.log 'received tasks from imdone-io for: %s', tasks
      return async.eachSeries(tasks,
        function (task, cb) {
          let taskToModify = _.assign(repo.getTask(task.id), task)
          if (!Task.isTask(taskToModify)) { return cb(new Error('Task not found')) }
          return repo.modifyTask(taskToModify, cb)
        },
        function (err) {
          if (err) { return repo.emit('sync.error', err) }
          return repo.writeFile(file, function (err, fileAfterSave) {
            if (err) return cb(err)
            if (file == null) { file = fileAfterSave }
            return client.syncTasksForDelete(repo, file.getTasks(), function (err, deletedTasks) {
              if (!cb) { return syncDone(tasks)(err) }
              return cb(err, syncDone(tasks))
            })
          })
        })
    })
  }

  let loadSort = cb => loadSortFile(cb)

  var loadSortFile = cb =>
    fs.access(SORT_FILE, fs.constants.R_OK | fs.constants.W_OK, (err) => {
      if (err) return cb()
      return fs.readFile(SORT_FILE, function (err, data) {
        if (err) { return cb(err) }
        try {
          _.set(repo, 'sync.sort', JSON.parse(data.toString()))
        } catch (e) {}
        return cb()
      })
    })

  let saveSort = function (cb) {
    if (cb == null) { cb = function () {} }
    return async.parallel([
      cb => saveSortFile(cb),
      cb => saveSortCloud(cb)
    ], cb)
  }

  var saveSortCloud = function (cb) {
    if (cb == null) { cb = function () {} }
    if (!repo.project) { return cb() }
    let sort = _.get(repo, 'sync.sort')

    return client.updateTaskOrder(repo.project.id, sort, (err, theProject) => {
      if (err) { return cb(err) }
      return cb(null, theProject.taskOrder)
    })
  }

  var saveSortFile = function (cb) {
    if (cb == null) { cb = function () {} }
    let sort = _.get(repo, 'sync.sort')
    return fs.writeFile(SORT_FILE, JSON.stringify(sort), cb)
  }

  var sortEnabled = () => repo.usingImdoneioForPriority()

  let getTaskId = task => _.get(task, 'meta.id[0]')

  let tasksToIds = tasks => Array.from(tasks).map((task) => getTaskId(task))

  let setListSort = function (name, ids, save) {
    _.remove(ids, val => val === null)
    _.set(repo, `sync.sort.${name}`, ids)
    if (save) { return saveSort() }
  }

  let populateSort = function (cb) {
    if (_.get(repo, 'project.taskOrder')) { return saveSort(cb) }
    fs.access(SORT_FILE, fs.constants.R_OK | fs.constants.W_OK, (err) => {
      if (err) { return cb() }
      // BACKLOG: remove sort number on all TODO comments when saving sort to cloud +enhancement gh:168 id:51
      // Populate the config.sync.sort from existing sort
      for (let list of Array.from(_getTasksByList())) { setListSort(list.name, tasksToIds(list.tasks)) }
      return saveSort(cb)
    })
  }

  let getIdsForList = name => _.get(repo, `sync.sort.${name}`)

  let sortBySyncId = function (name, tasks) {
    let ids = getIdsForList(name)
    if (!ids) { return tasks }
    return _.sortBy(tasks, task => ids.indexOf(getTaskId(task)))
  }

  repo.setTaskPriority = function (task, pos, cb) {
    if (!sortEnabled()) { return _setTaskPriority(task, pos, cb) }
    let taskId = getTaskId(task)
    let { list } = task
    let idsWithoutTask = _.without(getIdsForList(list), getTaskId(task))
    idsWithoutTask.splice(pos, 0, taskId)
    setListSort(list, idsWithoutTask)
    return cb()
  }

  repo.moveTasks = function (tasks, newList, newPos, cb) {
    let shouldSync = repo.isReadyToSync()
    if (cb == null) { cb = function () {} }
    return _moveTasks(tasks, newList, newPos, shouldSync, function (err, tasksByList) {
      if (err) { return cb(err) }
      if (!sortEnabled()) { return cb(null, tasksByList) }
      if (shouldSync) {
        // console.log 'Tasks moved.  Syncing with imdone.io'
        return syncTasks(tasks, function (err, done) {
          if (err) {
            done(err)
            return cb(err)
          }
          repo.emit('tasks.moved', tasks)
          return saveSort(function (err) {
            done(err)
            return cb(err, tasksByList)
          })
        })
      } else {
        if (!sortEnabled()) { return cb(null, tasksByList) }
        return saveSort(err => cb(err, tasksByList))
      }
    })
  }

  repo.getTasksInList = function (name, offset, limit) {
    let tasksInList = _getTasksInList(name, offset, limit)
    if (!sortEnabled()) { return tasksInList }
    return sortBySyncId(name, tasksInList)
  }

  repo.getTasksByList = function () {
    let tasksByList = _getTasksByList()
    if (!sortEnabled()) { return tasksByList }
    return (Array.from(tasksByList).map((list) => ({name: list.name, tasks: sortBySyncId(list.name, list.tasks)})))
  }

  repo.emitFileUpdate = function (file) {
    if (!client.isAuthenticated() || !repo.project) { return _emitFileUpdate(file) }
    if (repo.shouldEmitFileUpdate(file)) {
      syncFile(file, function (err, done) {
        if (err && done) return done(err)
        _emitFileUpdate(file)
        if (done) done(err)
      })
    }
  }

  repo.init = function (cb) {
    if (cb == null) { cb = function () {} }
    return async.parallel([
      cb => repo.loadConfig(cb),
      cb => loadSort(cb)
    ], function (err, results) {
      if (err) { return cb(err) }
      repo.config = results[0]

      return client.authFromStorage(function (err, user) {
        if (err) return cb(err)
        if (sortEnabled()) {
          return _init(function (err, files) {
            if (err) { return cb(err) }
            checkForIIOProject()
            return populateSort(err => cb(err, files))
          })
        } else {
          return _init(function (err, files) {
            if (err) { return cb(err) }
            checkForIIOProject()
            return cb(null, files)
          })
        }
      })
    })
  }

  repo.refresh = function (cb) {
    if (cb == null) { cb = function () {} }
    return repo.loadConfig(function (err, config) {
      if (err) { return cb(err) }
      repo.config = config
      if (!sortEnabled()) { return _refresh(cb) }
      return populateSort(err => {
        if (err) { return cb(err) }
        _refresh(function (err, files) {
          if (err) { return cb(err) }
          return cb(null, files)
        })
      })
    })
  }
  // TODO: Provide a way to delete tasks after they integrate,  maybe a delete\:true on the returning task. id:5
  return repo
}
