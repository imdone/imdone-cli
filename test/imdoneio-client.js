const should = require('should')
const Client = require('../lib/imdoneio-client')
const helper = require('./helper')
const EMAIL = 'imdone-test-1@imdone.io'
const PASS = 'password'
describe('imdoneio-client', () => {
  describe('init', () => {
    it('should emit unauthenticated', (done) => {
      let client = new Client()
      client.removeCredentials((err) => {
        if (err) return done(err)
        client.init()
        client.on('unauthenticated', () => {
          should(client.isAuthenticated()).be.false()
          done()
        })
      })
    }).timeout(6000)

    it('should emit authenticated', (done) => {
      let client = new Client()
      client.removeCredentials((err) => {
        if (err) return done(err)
        client.init(EMAIL, PASS)
        client.on('authenticated', () => {
          should(client.isAuthenticated()).be.true()
          done()
        })
      })
    }).timeout(6000)
  })

  describe('createProject', () => {
    it('should create a project on imdone.io', (done) => {
      let client = new Client()
      client.removeCredentials((err) => {
        if (err) return done(err)
        client.init(EMAIL, PASS)
        client.on('authenticated', () => {
          helper.initRepoAtDir('createProject-test', (err, repo) => {
            if (err) return done(err)
            client.createProject(repo, (err, project) => {
              if (err) return done(err)
              project.should.have.property('id').which.is.a.String()
              client.deleteProject(repo, done)
            })
          })
        })
      })
    }).timeout(6000)

    it('should return an error with a link to plan page if you try to add too many projects', (done) => {
      let client = new Client()
      client.removeCredentials((err) => {
        if (err) return done(err)
        client.init(EMAIL, PASS)
        client.on('authenticated', () => {
          helper.initRepoAtDir('createProject-test1', (err, repo1) => {
            if (err) return done(err)
            client.createProject(repo1, (err, project) => {
              if (err) return done(err)
              helper.initRepoAtDir('createProject-test2', (err, repo2) => {
                if (err) return done(err)
                client.createProject(repo2, (err, project) => {
                  should.exist(err)
                  err.should.have.property('message').which.is.a.String().and.is.equal('Payment Required')
                  client.deleteProject(repo1, done)
                })
              })
            })
          })
        })
      })
    }).timeout(6000)
  })
})
