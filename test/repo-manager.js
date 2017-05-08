const repoManager = require('../lib/repo-manager')
const helper = require('./helper')
const should = require('should')

describe('repo-manager', () => {
  describe('add', () => {
    it('it should add a repository by path and initialize it', (done) => {
      helper.newTestDataDir((err, testDataDir) => {
        if (err) return done(err)
        repoManager.removeAll()
        var repo = repoManager.add(testDataDir)
        should(repoManager.getAll()).be.an.Array().and.have.length(1)
        repo.on('initialized', (data) => {
          done()
        })
      })
    })

    it('should not allow a path to be added twice', (done) => {
      helper.newTestDataDir((err, testDataDir) => {
        if (err) return done(err)
        repoManager.removeAll()
        repoManager.add(testDataDir)
        should(repoManager.getAll()).be.an.Array().and.have.length(1)
        ;(function () {
          repoManager.add(testDataDir)
        }).should.throw(Error)
        done()
      })
    })
  })

  describe('remove', () => {
    it('should remove a repo by path', (done) => {
      helper.newTestDataDir(helper.getTempDir('myTest'), (err, testDataDir) => {
        if (err) return done(err)
        repoManager.removeAll()
        var repo = repoManager.add(testDataDir)
        helper.newTestDataDir(helper.getTempDir('myTest1'), (err, otherTestDir) => {
          if (err) return done(err)
          repoManager.add(otherTestDir).on('initialized', (data) => {
            should(repoManager.getAll()).be.an.Array().and.have.length(2)
            should(repoManager.remove(testDataDir)).be.equal(repo)
            should(repoManager.getAll()).be.an.Array().and.have.length(1)
            done()
          })
        })
      })
    })
  })
})
