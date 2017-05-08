const should = require('should')
const Client = require('../lib/imdoneio-client')

describe('imdoneio-client', () => {
  describe('getInstance', () => {
    it('should always return the same instance', () => {
      let client = Client.getInstance()
      should(client).be.equal(new Client())
      should(client).be.equal(Client.getInstance())
    })
  })
})
