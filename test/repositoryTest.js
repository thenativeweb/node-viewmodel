var expect = require('expect.js'),
    repository = require('../lib/repository'),
    Base = require('../lib/base'),
    ViewModel = require('../lib/viewmodel'),
    ConcurrencyError = require('../lib/concurrencyError'),
    InMemory = require('../lib/databases/inmemory');

describe('Repository', function() {

  it('it should have the correct interface', function() {

    expect(repository).to.be.an('object');
    expect(repository.write).to.be.a('function');
    expect(repository.read).to.be.a('function');
    expect(repository.Repository).to.eql(Base);
    expect(repository.Repository.ViewModel).to.eql(ViewModel);
    expect(repository.ViewModel).to.eql(ViewModel);
    expect(repository.ConcurrencyError).to.eql(ConcurrencyError);

  });

});