'use strict'

const _ = require('lodash/fp')
const request = require('request-promise')
const requireDir = require('require-dir')
const winston = require('winston')

const sinon = require('sinon')
const chai = require('chai')
chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))
const expect = chai.expect

const AppOpticsAPI = require('./index')


describe('A default AppOpticsApi', () => {
  function createInstanceWithTestEnv () {
    const orig = _.pickBy(_.negate(_.isUndefined), _.pickAll(['APPOPTICS_TOKEN'], process.env))
    process.env.APPOPTICS_TOKEN = 'testtoken'
    const appoptics = new AppOpticsAPI.AppOpticsApi()
    delete process.env.APPOPTICS_TOKEN
    _.assign(process.env, orig)
    return appoptics
  }

  const appOpticsAPI = createInstanceWithTestEnv()

  it('should use the public appoptics REST URL', function * () {
    expect(appOpticsAPI.serviceUrl).to.equal('https://api.appoptics.com/v1')
  })

  it('should use auth credentials from environment', function * () {
    expect(appOpticsAPI.auth).to.deep.equal({ 'user': '','pass': 'testtoken' })
  })

  it('should use the default request-promise', function * () {
    expect(appOpticsAPI.request).to.equal(request)
  })

  it('should log to winston root logger', function * () {
    expect(appOpticsAPI.logger).to.equal(winston)
  })

  it('should be provided by the package itself', function * () {
    expect(AppOpticsAPI).to.be.an.instanceof(AppOpticsAPI.AppOpticsApi)
    expect(AppOpticsAPI).to.have.a.property('auth')
    expect(AppOpticsAPI).to.have.a.property('request', request)
    expect(AppOpticsAPI).to.have.a.property('serviceUrl', 'https://api.appoptics.com/v1')
    expect(AppOpticsAPI).to.have.a.property('logger', winston)
  })
})

describe('AppOpticsApi.compositeDSL as $', () => {
  // eslint-disable-next-line no-unused-vars
  const $ = AppOpticsAPI.compositeDSL
  const transformFunctions = [
    'abs', 'derive', 'divide', 'integrate', 'max', 'mean', 'min',
    'moving_average', 'multiply', 'rate', 'scale', 'subtract', 'sum', 'window'
  ]
  const complexTestCases = [
    [`$.series('test.metric.1')`, 's("test.metric.1", "%")'],
    [`$.s('test.metric.*', '*')`, 's("test.metric.*", "*")'],
    [`$.sum($.s('test.metric.*'))`, 'sum([\n  s("test.metric.*", "%")\n])'],
    [`$.sum([$.s('test.metric.*')])`, 'sum([\n  s("test.metric.*", "%")\n])'],
    [`$.divide([$.s('test.1'), $.s('test.2')])`,
      'divide([\n  s("test.1", "%"),\n  s("test.2", "%")\n])'],
    [`$.divide([$.sum($.s('test.metric.*')), $.s('test.2')])`,
      'divide([\n  sum([\n    s("test.metric.*", "%")\n  ]),\n  s("test.2", "%")\n])'],
    [`$.window($.s('test.metric.*'), { size: 10, "function": "median" })`,
      'window([\n  s("test.metric.*", "%")\n], { size:"10", function:"median" })'],
    [`$.abs($.abs($.abs('ARG1', { foo: 'bar' })))`,
      'abs([\n  abs([\n    abs([\n      ARG1\n    ], { foo:"bar" })\n  ])\n])'],
    [`$.renderCompositeFn('twinkle')(['A', 'B'], { x: 'y' })`,
      'twinkle([\n  A,\n  B\n], { x:"y" })']
  ]

  function itShouldRenderCorrectlyTransformFn (fnName) {
    itShouldRenderCorrectly([`$.${fnName}('A1')`, `${fnName}([\n  A1\n])`])
  }

  function itShouldRenderCorrectly (exprAndExpected) {
    const expr = exprAndExpected[0]
    const expected = exprAndExpected[1]
    it(`should render correctly ${expr}`, function * () {
      // eslint-disable-next-line no-eval
      expect(eval(expr)).to.equal(expected)
    })
  }

  _.forEach(itShouldRenderCorrectlyTransformFn, transformFunctions)
  _.forEach(itShouldRenderCorrectly, complexTestCases)
})

describe('A test AppOpticsApi', () => {
  const optsFooBar = { foo: 'bar' }

  const stream1 = { name: 's1', id: 1011, type: 'gauge', source: '*' }
  const stream2 = { name: 's2', id: 1012, type: 'counter', source: '%' }
  const stream3 = { name: 's2', id: 1012, type: 'composite', source: '%', composite: 'sum(s (...)', metric: { somthing: 1 } }
  const chart1 = { name: 'chart1', id: 101, streams: [stream1, stream2] }
  const chart2 = { name: 'chart2', id: 102, streams: [stream2, stream3] }
  const space1 = {
    name: 'space1',
    charts: [
      { name: 'chart1', streams: [{ name: 's1', source: '*' }, { name: 's2', source: '%' }] },
      { name: 'chart2', streams: [{ name: 's2', source: '%' }] }
    ]
  }
  const space1a = {
    name: 'space1',
    charts: [
      { name: 'chart1', streams: [{ name: 's1', source: '*' }] },
      { name: 'chart3', streams: [{ name: 's3', source: '%' }] }
    ]
  }
  const space1b = {
    name: 'space1',
    charts: [
      { name: 'chart1', streams: [{ name: 's1', source: '*' }] },
      { name: '', streams: [{ name: 's3', source: '%' }] }
    ]
  }
  const space1c = {
    name: 'space1',
    charts: [
      { name: 'chart1', streams: [{ name: 's1', source: '*' }] },
      { name: 'chart3', streams: [{ name: 's3', source: '%' }] },
      { name: 'chart1', streams: [{ name: 's2', source: '%' }] }
    ]
  }

  const oldAlert1 = { id: 101, name: 'alert1', services: [1, 3] }
  const newAlert1 = { name: 'alert1', services: ['service1', 'service2'] }
  const newAlert2 = { name: 'alert2', services: ['service1', 'service7'] }
  const postAlert1 = { name: 'alert1', services: [1, 2] }
  const resultAlert1 = { id: 101, name: 'alert1', services: [1, 2] }
  const service1 = { id: 1, title: 'service1' }
  const service2 = { id: 2, title: 'service2' }
  const service3 = { id: 3, title: 'service3' }
  const oldService3 = { id: 3, title: 'service3', old: true }
  const newService3 = { title: 'service3' }
  const services = [service1, service2, service3]

  const exampleConfig = requireDir('./example-config', { recurse: true })
  const processedExampleConfig = require('./example-config-processed')

  let AppOpticsApi
  beforeEach(function * () {
    AppOpticsApi = new AppOpticsAPI.AppOpticsApi({
      serviceUrl: 'http://url/v1',
      auth: { pass: 'testtoken' },
      // reflect back request options in the result, maybe we should use sinon instead
      request: function () { return Promise.resolve(Array.from(arguments)) },
      logger: sinon.stub(new (winston.Logger)())
    })
  })
  afterEach(function * () {
    sinon.restore()
  })

  describe('(straight API calls)', () => {
    it('should do an arbitrary API request with logging', function * () {
      const path = ['foo', 123, 'bar', 456]
      const options = { qs: { x: 'y' } }
      const expectedRequest = [{
        auth: { pass: 'testtoken' },
        json: true,
        qs: { x: 'y' },
        url: 'http://url/v1/foo/123/bar/456'
      }]

      const r = yield AppOpticsApi.apiRequest(path, options)

      expect(r).to.have.length(1)
      expect(r).to.deep.equal(expectedRequest)

      expect(AppOpticsApi.logger.debug).to.have.been.calledOnce
      const log1 = AppOpticsApi.logger.debug.firstCall.args
      const requestId = log1[1].requestId
      expect(requestId).to.match(/^[0-9a-f-]*$/i)
      expect(log1).to.deep.equal([
        'AppOpticsApi#apiRequest',
        { path, opts: options, opts2: undefined, requestId }
      ])

      expect(AppOpticsApi.logger.silly).to.have.been.calledOnce
      const log2 = AppOpticsApi.logger.silly.firstCall.args
      expect(log2).to.include.deep.equal([
        'AppOpticsApi#apiRequest result',
        { requestId, result: expectedRequest }
      ])
    })

    it('should fail an API request with logging', function * () {
      const path = ['foo', 123]
      const error = new Error('something happened')
      AppOpticsApi.request = () => Promise.reject(error)

      yield expect(AppOpticsApi.apiRequest(path)).to.eventually.be.rejectedWith(error)

      expect(AppOpticsApi.logger.debug).to.have.been.calledOnce
      const log1 = AppOpticsApi.logger.debug.firstCall.args
      const requestId = log1[1].requestId
      expect(requestId).to.match(/^[0-9a-f-]*$/i)
      expect(log1).to.deep.equal([
        'AppOpticsApi#apiRequest',
        { path, opts: undefined, opts2: undefined, requestId }
      ])

      expect(AppOpticsApi.logger.silly).to.have.been.calledOnce
      const log2 = AppOpticsApi.logger.silly.firstCall.args
      expect(log2).to.include.deep.equal([
        'AppOpticsApi#apiRequest error',
        { error, requestId }
      ])
    })

    it('should get metrics', function * () {
      const r = yield AppOpticsApi.getMetrics()
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/metrics'
      })
    })

    it('should get metric definitions with pagination params', function * () {
      const r = yield AppOpticsApi.getMetrics({ qs: { offset: 200, length: 50 } })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/metrics',
        qs: { offset: 200, length: 50 }
      })
    })

    it('should support getAllPaginated for getMetrics', function * () {
      expect(AppOpticsApi.getMetrics).to.have.property('resultPath', 'metrics')
    })

    it('should get a single metric definition', function * () {
      const r = yield AppOpticsApi.getMetric('test.metric')
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/metrics/test.metric'
      })
    })

    it('should support getAllPaginatedKeyset for getMetric', function () {
      expect(AppOpticsApi.getMetric).to.have.property('resultPath', 'measurements')
    })

    it('should put a metric definition', function * () {
      const r = yield AppOpticsApi.putMetric(
        'test.metric',
        { type: 'composite', composite: 'sum([A, B])' }
      )
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/metrics/test.metric',
        method: 'PUT',
        body: { type: 'composite', composite: 'sum([A, B])' }
      })
    })

    it('should delete a metric', function * () {
      const r = yield AppOpticsApi.deleteMetric('test.metric')
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/metrics/test.metric',
        method: 'DELETE'
      })
    })

    it('should get spaces', function * () {
      const r = yield AppOpticsApi.getSpaces()
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces'
      })
    })

    it('should support getAllPaginated for getSpaces', function * () {
      expect(AppOpticsApi.getSpaces).to.have.property('resultPath', 'spaces')
    })

    it('should get a single space definition', function * () {
      const r = yield AppOpticsApi.getSpace(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/12345'
      })
    })

    it('should post a new space definition', function * () {
      const r = yield AppOpticsApi.postSpace({ name: 'Test Space 1' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces',
        method: 'POST',
        body: { name: 'Test Space 1' }
      })
    })

    it('should post a new space with name only', function * () {
      const r = yield AppOpticsApi.postSpace('Test Space 1')
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces',
        method: 'POST',
        body: { name: 'Test Space 1' }
      })
    })

    it('should put a space definition', function * () {
      const r = yield AppOpticsApi.putSpace(12345, { name: 'Test Space 1a' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/12345',
        method: 'PUT',
        body: { name: 'Test Space 1a' }
      })
    })

    it('should delete a space', function * () {
      const r = yield AppOpticsApi.deleteSpace(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/12345',
        method: 'DELETE'
      })
    })

    it('should get charts of a space', function * () {
      const r = yield AppOpticsApi.getCharts(123)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/123/charts'
      })
    })

    it('should not allow getAllPaginated for getCharts', function * () {
      expect(AppOpticsApi.getCharts).to.not.have.property('resultPath')
    })

    it('should get a single chart definition', function * () {
      const r = yield AppOpticsApi.getChart(123, 456)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/123/charts/456'
      })
    })

    it('should post a new chart definition', function * () {
      const r = yield AppOpticsApi.postChart(123, { name: 'C1', x: 'y' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/123/charts',
        method: 'POST',
        body: { name: 'C1', x: 'y' }
      })
    })

    it('should put a chart definition', function * () {
      const r = yield AppOpticsApi.putChart(123, 456, { name: 'C2' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/123/charts/456',
        method: 'PUT',
        body: { name: 'C2' }
      })
    })

    it('should delete a chart', function * () {
      const r = yield AppOpticsApi.deleteChart(123, 456)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/spaces/123/charts/456',
        method: 'DELETE'
      })
    })

    it('should get alerts', function * () {
      const r = yield AppOpticsApi.getAlerts()
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/alerts'
      })
    })

    it('should support getAllPaginated for getAlerts', function * () {
      expect(AppOpticsApi.getAlerts).to.have.property('resultPath', 'alerts')
    })

    it('should get status of alerts', function * () {
      const r = yield AppOpticsApi.getAlertsStatus()
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/alerts/status'
      })
    })

    it('should get a single alert definition', function * () {
      const r = yield AppOpticsApi.getAlert(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/alerts/12345'
      })
    })

    it('should post a new alert definition', function * () {
      const r = yield AppOpticsApi.postAlert({ name: 'Test Alert 1' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/alerts',
        method: 'POST',
        body: { name: 'Test Alert 1' }
      })
    })

    it('should put an alert definition', function * () {
      const r = yield AppOpticsApi.putAlert(12345, { name: 'Test Alert 1a' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/alerts/12345',
        method: 'PUT',
        body: { name: 'Test Alert 1a' }
      })
    })

    it('should delete an alert', function * () {
      const r = yield AppOpticsApi.deleteAlert(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/alerts/12345',
        method: 'DELETE'
      })
    })

    it('should get services', function * () {
      const r = yield AppOpticsApi.getServices()
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/services'
      })
    })

    it('should support getAllPaginated for getServices', function * () {
      expect(AppOpticsApi.getServices).to.have.property('resultPath', 'services')
    })

    it('should get a single service definition', function * () {
      const r = yield AppOpticsApi.getService(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/services/12345'
      })
    })

    it('should post a new service definition', function * () {
      const r = yield AppOpticsApi.postService({ title: 'Test Service 1' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/services',
        method: 'POST',
        body: { title: 'Test Service 1' }
      })
    })

    it('should put a service definition', function * () {
      const r = yield AppOpticsApi.putService(12345, { title: 'Test Service 1a' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/services/12345',
        method: 'PUT',
        body: { title: 'Test Service 1a' }
      })
    })

    it('should delete a service', function * () {
      const r = yield AppOpticsApi.deleteService(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/services/12345',
        method: 'DELETE'
      })
    })

    it('should get sources', function * () {
      const r = yield AppOpticsApi.getSources()
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/sources'
      })
    })

    it('should support getAllPaginated for getSources', function * () {
      expect(AppOpticsApi.getSources).to.have.property('resultPath', 'sources')
    })

    it('should get a single source definition', function * () {
      const r = yield AppOpticsApi.getSource(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/sources/12345'
      })
    })

    it('should put a source definition', function * () {
      const r = yield AppOpticsApi.putSource(12345, { title: 'Test Source 1a' })
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/sources/12345',
        method: 'PUT',
        body: { title: 'Test Source 1a' }
      })
    })

    it('should delete a source', function * () {
      const r = yield AppOpticsApi.deleteSource(12345)
      expect(r).to.have.length(1)
      expect(r[0]).to.deep.equal({
        auth: { pass: 'testtoken' },
        json: true,
        url: 'http://url/v1/sources/12345',
        method: 'DELETE'
      })
    })
  })

  describe('(pagination iteration helpers)', () => {
    it('should iterate over and aggregate paginated results', function * () {
      const getXs = sinon.stub()
      getXs
        .withArgs({ foo: 'bar', qs: { offset: 0 } })
        .returns(Promise.resolve({ query: { offset: 0, length: 3, found: 8 }, xs: [1, 2, 3] }))
      getXs
        .withArgs({ foo: 'bar', qs: { offset: 3 } })
        .returns(Promise.resolve({ query: { offset: 3, length: 3, found: 8 }, xs: [4, 5, 6] }))
      getXs
        .withArgs({ foo: 'bar', qs: { offset: 6 } })
        .returns(Promise.resolve({ query: { offset: 6, length: 2, found: 8 }, xs: [7, 8] }))
      getXs.resultPath = 'xs'

      const result = yield AppOpticsApi.getAllPaginated(getXs, optsFooBar)

      expect(result).to.eql([1, 2, 3, 4, 5, 6, 7, 8])
      expect(getXs)
        .to.have.been.calledThrice
        .and.to.have.always.been.calledOn(AppOpticsApi)
    })

    it('should assert valid paginated getter on getAllPaginated call', function * () {
      const getXs = sinon.stub()
      // this really is asserted before a Promise is built, because it violates the call contract
      expect(() => AppOpticsApi.getAllPaginated(getXs)).to.throw('invalid paginatedGetter')
    })

    it('should get all metrics', function * () {
      const stubResult = { metrics: '<all>' }
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getMetrics, optsFooBar)
        .returns(Promise.resolve(stubResult))
      const result = yield AppOpticsApi.getAllMetrics(optsFooBar)
      expect(result).to.deep.equal({ metrics: '<all>' })
    })

    it('should get all spaces', function * () {
      const stubResult = { spaces: '<all>' }
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getSpaces, optsFooBar)
        .returns(Promise.resolve(stubResult))
      const result = yield AppOpticsApi.getAllSpaces(optsFooBar)
      expect(result).to.deep.equal({ spaces: '<all>' })
    })

    it('should get all alerts', function * () {
      const stubResult = { alerts: '<all>' }
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getAlerts, optsFooBar)
        .returns(Promise.resolve(stubResult))
      const result = yield AppOpticsApi.getAllAlerts(optsFooBar)
      expect(result).to.deep.equal({ alerts: '<all>' })
    })

    it('should get all services', function * () {
      const stubResult = { services: '<all>' }
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getServices, optsFooBar)
        .returns(Promise.resolve(stubResult))
      const result = yield AppOpticsApi.getAllServices(optsFooBar)
      expect(result).to.deep.equal({ services: '<all>' })
    })

    it('should get all sources', function * () {
      const stubResult = { sources: '<all>' }
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getSources, optsFooBar)
        .returns(Promise.resolve(stubResult))
      const result = yield AppOpticsApi.getAllSources(optsFooBar)
      expect(result).to.deep.equal({ sources: '<all>' })
    })
  })

  describe('(keyset pagination iteration helpers)', () => {
    it('should iterate over and aggregate paginated results', function * () {
      const getXs = sinon.stub()
      getXs
        .withArgs({ foo: 'bar', qs: { start_time: 5 } })
        .resolves({ query: { next_time: 10 }, xs: { a: [1, 2, 3] }, abc: 'xyz' })
      getXs
        .withArgs({ foo: 'bar', qs: { start_time: 10 } })
        .resolves({ query: { next_time: 20 }, xs: { a: [4], b: [5, 6] }, abc: 'xyz' })
      getXs
        .withArgs({ foo: 'bar', qs: { start_time: 20 } })
        .resolves({ xs: { c: [7, 8, 9] }, abc: 'xyz' })
      getXs.resultPath = 'xs'

      const opts = { foo: 'bar', qs: { start_time: 5 } }
      const result = yield AppOpticsApi.getAllPaginatedKeyset(getXs, opts)

      expect(result).to.eql({ xs : { a: [1, 2, 3, 4], b: [5, 6], c: [7, 8, 9] }, abc: 'xyz' })
      expect(getXs)
        .to.have.been.calledThrice
        .and.to.have.always.been.calledOn(AppOpticsApi)
    })

    it('should bind optional arguments to paginated getter', function * () {
      const getXs = sinon.stub()
      getXs
        .withArgs('argument 1', 'argument 2', optsFooBar)
        .resolves({ xs: { a: [1, 2, 3] } })
      getXs.resultPath = 'xs'

      const result = yield AppOpticsApi.getAllPaginatedKeyset(getXs, optsFooBar, 'argument 1', 'argument 2')

      expect(result).to.eql({ xs: { a: [1, 2, 3] } })
    })

    it('should set an empty object for the nonexistent result path', function * () {
      const getXs = sinon.stub()
      getXs
        .withArgs(optsFooBar)
        .resolves({ abc: 'xyz' })
      getXs.resultPath = 'nonexistent'

      const result = yield AppOpticsApi.getAllPaginatedKeyset(getXs, optsFooBar)

      expect(result).to.eql({ nonexistent: {}, abc: 'xyz' })
    })

    it('should assert valid paginated getter on getAllPaginatedKeyset call', function () {
      const getXs = sinon.stub()
      const getAllPaginatedOffset = () => AppOpticsApi.getAllPaginated(getXs)
      expect(getAllPaginatedOffset).to.throw('invalid paginatedGetter')
    })

    it('should get all measurements', function * () {
      const stubResult = { measurements: {} }
      sinon.stub(AppOpticsApi, 'getAllPaginatedKeyset')
        .withArgs(AppOpticsApi.getMetric, optsFooBar, 'metric')
        .resolves(stubResult)
      const result = yield AppOpticsApi.getAllMeasurements('metric', optsFooBar)
      expect(result).to.eql({ measurements: {} })
    })
  })

  describe('(custom finders)', () => {
    it('should find a space by exact name', function * () {
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getSpaces, { qs: { name: 'Test' } })
        .returns(Promise.resolve([{ name: 'Test Space' }, { name: 'Test' }]))
      const r = yield AppOpticsApi.findSpaceByName('Test')
      expect(r).to.be.eql({ name: 'Test' })
    })

    it('should fail to find a space by name', function * () {
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getSpaces, { qs: { name: 'Test Space 2' } })
        .returns(Promise.resolve([{ name: 'Test Space' }, { name: 'Test' }]))
      yield expect(AppOpticsApi.findSpaceByName('Test Space 2'))
        .to.eventually.be.rejectedWith('no space named Test Space 2')
    })

    it('should find an alert by exact name', function * () {
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getAlerts, { qs: { name: 'Test' } })
        .returns(Promise.resolve([{ name: 'Test Alert' }, { name: 'Test' }]))
      const r = yield AppOpticsApi.findAlertByName('Test')
      expect(r).to.be.eql({ name: 'Test' })
    })

    it('should fail to find an alert by name', function * () {
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getAlerts, { qs: { name: 'Test Alert 2' } })
        .returns(Promise.resolve([{ name: 'Test Alert' }, { name: 'Test' }]))
      yield expect(AppOpticsApi.findAlertByName('Test Alert 2'))
        .to.eventually.be.rejectedWith('no alert named Test Alert 2')
    })

    it('should find an service by exact title', function * () {
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getServices, { qs: { title: 'Test' } })
        .returns(Promise.resolve([{ title: 'Test Service' }, { title: 'Test' }]))
      const r = yield AppOpticsApi.findServiceByTitle('Test')
      expect(r).to.be.eql({ title: 'Test' })
    })

    it('should fail to find an service by title', function * () {
      sinon.stub(AppOpticsApi, 'getAllPaginated')
        .withArgs(AppOpticsApi.getServices, { qs: { title: 'Test Service 2' } })
        .returns(Promise.resolve([{ title: 'Test Service' }, { title: 'Test' }]))
      yield expect(AppOpticsApi.findServiceByTitle('Test Service 2'))
        .to.eventually.be.rejectedWith('no service named Test Service 2')
    })
  })

  describe('(space and chart ops)', () => {
    it('should dump a space with charts', function * () {
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.resolve({ name: 'space1', id: 333 }))
      sinon.stub(AppOpticsApi, 'getCharts')
        .withArgs(333)
        .returns(Promise.resolve([chart1, chart2]))

      const r = yield AppOpticsApi.dumpSpace('space1')

      expect(r).to.be.eql({
        name: 'space1',
        charts: [
          { name: 'chart1',
            streams: [
              { name: 's1', source: '*' },
              { name: 's2', source: '%' }
            ]
          },
          { name: 'chart2',
            streams: [
              { name: 's2', source: '%' },
              { name: 's2', source: '%', 'metric': { 'somthing': 1 } }
            ]
          }
        ]
      })
    })

    it('should fail to dump a space', function * () {
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.reject(new Error('no space named space1')))
      yield expect(AppOpticsApi.dumpSpace('space1'))
        .to.eventually.be.rejectedWith('no space named space1')
    })

    it('should create a space with charts', function * () {
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.reject('no such space'))
      sinon.stub(AppOpticsApi, 'postSpace')
        .withArgs({ name: 'space1' })
        .returns(Promise.resolve({ name: 'space1', id: 333 }))
      const postSpy = sinon.spy(AppOpticsApi, 'postChart')
      const putSpy = sinon.spy(AppOpticsApi, 'putChart')
      const deleteSpy = sinon.spy(AppOpticsApi, 'deleteChart')

      yield AppOpticsApi.createOrUpdateSpace(space1)

      expect(AppOpticsApi.postSpace).to.have.been.calledOnce
      expect(postSpy).to.have.been.calledTwice
        .and.calledWithExactly(333, space1.charts[0])
        .and.calledWithExactly(333, space1.charts[1])
      expect(putSpy).to.not.have.been.called
      expect(deleteSpy).to.not.have.been.called
    })

    it('should update a space with charts', function * () {
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.resolve({ name: 'space1', id: 333 }))
      sinon.stub(AppOpticsApi, 'getCharts')
        .withArgs(333)
        .returns(Promise.resolve([chart1, chart2]))
      sinon.spy(AppOpticsApi, 'postSpace')
      const postSpy = sinon.spy(AppOpticsApi, 'postChart')
      const putSpy = sinon.spy(AppOpticsApi, 'putChart')
      const deleteSpy = sinon.spy(AppOpticsApi, 'deleteChart')

      yield AppOpticsApi.createOrUpdateSpace(space1a)

      expect(AppOpticsApi.postSpace).to.not.have.been.called
      expect(postSpy).to.have.been.calledOnce
        .and.calledWithExactly(333, space1a.charts[1])
      expect(putSpy).to.have.been.calledOnce
        .and.calledWithExactly(333, 101, space1a.charts[0])
      expect(deleteSpy).to.have.been.calledOnce
        .and.calledWithExactly(333, 102)
    })

    it('should fail to update space with empty chart names', function * () {
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.resolve({ name: 'space1', id: 333 }))
      sinon.stub(AppOpticsApi, 'getCharts')
        .withArgs(333)
        .returns(Promise.resolve([chart1, chart2]))
      const postSpy = sinon.spy(AppOpticsApi, 'postChart')
      const putSpy = sinon.spy(AppOpticsApi, 'putChart')
      const deleteSpy = sinon.spy(AppOpticsApi, 'deleteChart')

      yield expect(AppOpticsApi.createOrUpdateSpace(space1b))
        .to.eventually.be.rejectedWith('empty chart name in space space1')

      expect(postSpy).to.not.have.been.called
      expect(putSpy).to.not.have.been.called
      expect(deleteSpy).to.not.have.been.called
    })

    it('should fail to update a space with duplicate chart names', function * () {
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.resolve({ name: 'space1', id: 333 }))
      sinon.stub(AppOpticsApi, 'getCharts')
        .withArgs(333)
        .returns(Promise.resolve([chart1, chart2]))
      const postSpy = sinon.spy(AppOpticsApi, 'postChart')
      const putSpy = sinon.spy(AppOpticsApi, 'putChart')
      const deleteSpy = sinon.spy(AppOpticsApi, 'deleteChart')

      yield expect(AppOpticsApi.createOrUpdateSpace(space1c))
        .to.eventually.be.rejectedWith('duplicate chart names in space space1')

      expect(postSpy).to.not.have.been.called
      expect(putSpy).to.not.have.been.called
      expect(deleteSpy).to.not.have.been.called
    })

    it('should report chart op failures', function * () {
      const chartErr = errors => {
        const err = new Error('chart op failed')
        err.error = { errors }
        return err
      }
      sinon.stub(AppOpticsApi, 'findSpaceByName')
        .withArgs('space1')
        .returns(Promise.resolve({ name: 'space1', id: 333 }))
      sinon.stub(AppOpticsApi, 'getCharts')
        .withArgs(333)
        .returns(Promise.resolve([chart1, chart2]))
      sinon.stub(AppOpticsApi, 'postChart')
        .returns(Promise.reject(chartErr(['bad post params'])))
      sinon.stub(AppOpticsApi, 'putChart')
        .returns(Promise.reject(chartErr(['bad put params'])))
      sinon.stub(AppOpticsApi, 'deleteChart')
        .returns(Promise.reject(chartErr(['bad delete params'])))

      const p = AppOpticsApi.createOrUpdateSpace(space1a)
      yield expect(p).to.eventually.be.rejectedWith('some chart operations failed in space space1')
      yield p.catch(err => {
        expect(err).to.have.nested.property('error.errors').which.eql([
          { chart: 'chart2', op: 'delete', errors: ['bad delete params'] },
          { chart: 'chart1', op: 'update', errors: ['bad put params'] },
          { chart: 'chart3', op: 'create', errors: ['bad post params'] }
        ])
      })
    })
  })

  describe('(alert & service)', () => {
    it('should create an alert', function * () {
      sinon.stub(AppOpticsApi, 'getAllServices')
        .returns(Promise.resolve(services))
      sinon.stub(AppOpticsApi, 'findAlertByName')
        .withArgs('alert1')
        .returns(Promise.reject('no such alert'))
      sinon.stub(AppOpticsApi, 'postAlert')
        .withArgs(postAlert1)
        .returns(Promise.resolve(resultAlert1))
      sinon.spy(AppOpticsApi, 'putAlert')

      const result = yield AppOpticsApi.createOrUpdateAlert(newAlert1)

      expect(AppOpticsApi.postAlert).to.have.been.calledOnce
      expect(AppOpticsApi.putAlert).to.not.have.been.called
      expect(result).to.equal(resultAlert1)
    })

    it('should update an alert', function * () {
      sinon.stub(AppOpticsApi, 'getAllServices')
        .returns(Promise.resolve(services))
      sinon.stub(AppOpticsApi, 'findAlertByName')
        .withArgs('alert1')
        .returns(Promise.resolve(oldAlert1))
      sinon.spy(AppOpticsApi, 'postAlert')
      sinon.stub(AppOpticsApi, 'putAlert')
        .withArgs(101, postAlert1)
        .returns(Promise.resolve(resultAlert1))

      const result = yield AppOpticsApi.createOrUpdateAlert(newAlert1)

      expect(AppOpticsApi.postAlert).to.not.have.been.called
      expect(AppOpticsApi.putAlert).to.have.been.calledOnce
      expect(result).to.equal(resultAlert1)
    })

    it('should fail on missing service', function * () {
      sinon.stub(AppOpticsApi, 'getAllServices')
        .returns(Promise.resolve(services))
      sinon.spy(AppOpticsApi, 'findAlertByName')
      sinon.spy(AppOpticsApi, 'postAlert')
      sinon.spy(AppOpticsApi, 'putAlert')

      const result = AppOpticsApi.createOrUpdateAlert(newAlert2)

      yield expect(result).to.eventually.be.rejectedWith('no service named service7')
      expect(AppOpticsApi.findAlertByName).to.not.have.been.called
      expect(AppOpticsApi.postAlert).to.not.have.been.called
      expect(AppOpticsApi.putAlert).to.not.have.been.called
    })

    it('should create a service', function * () {
      sinon.stub(AppOpticsApi, 'findServiceByTitle')
        .withArgs('service3')
        .returns(Promise.reject('no such service'))
      sinon.stub(AppOpticsApi, 'postService')
        .withArgs(newService3)
        .returns(Promise.resolve(service3))
      sinon.spy(AppOpticsApi, 'putService')

      const result = yield AppOpticsApi.createOrUpdateService(newService3)

      expect(AppOpticsApi.postService).to.have.been.calledOnce
      expect(AppOpticsApi.putService).to.not.have.been.called
      expect(result).to.equal(service3)
    })

    it('should update a service', function * () {
      sinon.stub(AppOpticsApi, 'findServiceByTitle')
        .withArgs('service3')
        .returns(Promise.resolve(oldService3))
      sinon.spy(AppOpticsApi, 'postService')
      sinon.stub(AppOpticsApi, 'putService')
        .withArgs(3, newService3)
        .returns(Promise.resolve(service3))

      const result = yield AppOpticsApi.createOrUpdateService(newService3)

      expect(AppOpticsApi.postService).to.not.have.been.called
      expect(AppOpticsApi.putService).to.have.been.calledOnce
      expect(result).to.equal(service3)
    })
  })

  describe('(config management)', () => {
    it('should process empty raw config', function * () {
      const rawConfig = { }
      const config = AppOpticsApi._processRawConfig(rawConfig)
      const sections = { metrics: [], spaces: [], alerts: [], services: [], sources: [] }
      expect(config).to.deep.equal(
        _.merge(sections, { outdated: sections })
      )
    })

    it('should process raw example config', function * () {
      const config = AppOpticsApi._processRawConfig(exampleConfig)
      expect(config).to.deep.equal(processedExampleConfig)
    })
  })
})
