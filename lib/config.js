const config = {
  dev: {
    name: 'localhost',
    imdoneKeyA: 'NjbOJJ42rA4zdkEE8gs-D_USeA-_iUa9tpZLOFwKcGEh9PymSSP9zw==',
    imdoneKeyB: 'ZHpAmF5D8S_7lVuDNP--hgJGncY=',
    pusherKey: '64354707585286cfe58f',
    pusherChannelPrefix: 'private-imdoneio-dev',
    baseUrl: 'http://localhost:3000'
  },

  beta: {
    name: 'beta.imdone.io',
    imdoneKeyA: 'WFuE-QDFbrN5lip0gdHyYAdXDMdZPerXFey02k93dn-HOYJXoAAdBA==',
    imdoneKeyB: 'ALnfTYYEtghJBailJ1n-7tx4hIo=',
    pusherKey: '0a4f9a6c45def222ab08',
    pusherChannelPrefix: 'private-imdoneio-beta',
    baseUrl: 'https://beta.imdone.io'
  },

  prod: {
    name: 'imdone.io',
    imdoneKeyA: 'X8aukodrNNHKGkMKGhtcU8lI4KvNdMxCkYUiKOjh3JjH1-zj0qIDPA==',
    imdoneKeyB: '7Bo_oUdtzJxeFhdnGrrVrtGHTy8=',
    pusherKey: 'ba1f2dde238cb1f5944e',
    baseUrl: 'https://imdone.io',
    pusherChannelPrefix: 'private-imdoneio'
  }
}

module.exports = config.prod
