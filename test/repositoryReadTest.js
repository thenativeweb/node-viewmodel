var expect = require('expect.js'),
    async = require('async'),
    _ = require('lodash'),
    repository = require('../lib/repository'),
    ConcurrencyError = require('../lib/concurrencyError'),
    Base = require('../lib/base'),
    ViewModel = require('../lib/viewmodel'),
    InMemory = require('../lib/databases/inmemory'),
    dummyWriteRepo;

function cleanRepo(done) {
  dummyWriteRepo.clearAll(done);
}

describe('Repository read', function() {

  describe('calling read', function() {

    describe('without options', function() {

      it('it should return with the in memory repository', function() {

        var repo = repository.read();
        expect(repo).to.be.a('object');

      });

      describe('but with a callback', function() {

        it('it should callback with repository object', function(done) {

          repository.read(function(err, repo) {
            expect(err).not.to.be.ok();
            expect(repo).to.be.a('object');
            done();
          });

        });

      });

    });

    describe('with options of a non existing db implementation', function() {

      it('it should throw an error', function() {

        expect(function() {
          repository.read({ type: 'strangeDb' });
        }).to.throwError();

      });

      it('it should callback with an error', function(done) {

        expect(function() {
          repository.read({ type: 'strangeDb' }, function(err) {
            expect(err).to.be.ok();
            done();
          });
        }).to.throwError();

      });

    });

    describe('with options of an own db implementation', function() {

      it('it should return with the an instance of that implementation', function() {

        var repo = repository.read({ type: InMemory });
        expect(repo).to.be.a(InMemory);

      });

    });

    describe('with options containing a type property with the value of', function() {

      var types = ['inmemory', 'mongodb', 'tingodb', 'couchdb', 'redis', 'elasticsearch6', 'dynamodb'/*, 'elasticsearch', 'documentdb', 'azuretable'*/];

      types.forEach(function(type) {

        describe('"' + type + '"', function() {

          before(function(done) {
            repository.write({ type: type }, function(err, repo) {
              dummyWriteRepo = repo.extend({
                collectionName: 'dummies'
              });

              done();
            });
          });

          var repo;

          describe('without callback', function() {

            afterEach(function(done) {
              repo.disconnect(done);
            });

            it('it should not emit connect', function(done) {

              repo = repository.read({ type: type });
              repo.once('connect', function () {
                expect(true).to.eql(false);
              });

              setTimeout(done, 199);

            });

            it('it should return with the correct repository', function() {

              repo = repository.read({ type: type });
              expect(repo).to.be.a('object');
              expect(repo.connect).to.be.a('function');
              expect(repo.disconnect).to.be.a('function');
              expect(repo.getNewId).to.be.a('function');
              expect(repo.get).to.be.a('function');
              expect(repo.find).to.be.a('function');
              expect(repo.findOne).to.be.a('function');
              expect(repo.commit).to.be.a('function');
              expect(repo.checkConnection).to.be.a('function');
              expect(repo.extend).to.be.a('function');
              expect(repo.clear).to.be.a('function');

            });

            describe('calling connect', function () {

              it('it should emit connect', function(done) {

                repo = repository.read({ type: type });
                repo.once('connect', done);
                repo.connect();

              });

            });

          });

          describe('with callback', function() {

            afterEach(function(done) {
              repo.disconnect(done);
            });

            it('it should return with the correct repository', function(done) {

              repository.read({ type: type }, function(err, resR) {
                repo = resR;
                expect(resR).to.be.a('object');
                done();
              });

            });

          });

          describe('having connected', function() {

            describe('calling disconnect', function() {

              beforeEach(function(done) {
                repository.read({ type: type }, function(err, resR) {
                  repo = resR;
                  done();
                });
              });

              it('it should callback successfully', function(done) {

                repo.disconnect(function(err) {
                  expect(err).not.to.be.ok();
                  done();
                });

              });

              it('it should emit disconnect', function(done) {

                repo.once('disconnect', done);
                repo.disconnect();

              });

            });

            describe('using the repository', function() {

              var dummyRepo;

              before(function(done) {
                repository.read({ type: type }, function(err, resR) {
                  repo = resR;
                  dummyRepo = repo.extend({
                    collectionName: dummyWriteRepo.collectionName
                  });

                  // special case for tingodb
                  if (type === 'tingodb') {
                    dummyWriteRepo.db = dummyRepo.db;
                    dummyWriteRepo.collection = dummyRepo.collection;
                  }

                  done();
                });
              });

              beforeEach(function(done) {
                cleanRepo(done);
              });

              describe('calling getNewId', function() {

                it('it should callback with a new Id as string', function(done) {

                  dummyRepo.getNewId(function(err, id) {
                    expect(err).not.to.be.ok();
                    expect(id).to.be.a('string');
                    done();
                  });

                });

              });

              describe('calling get', function() {

                describe('subscribing to before/after-database-get', function() {

                  it('it should emit the correct event', function(done) {

                    var receivedBefore = false;
                    var receivedAfter = false;
                    dummyRepo.on('before-database-get', function() { receivedBefore = true; });
                    dummyRepo.on('after-database-get', function() { receivedAfter = true; });

                    dummyRepo.get(function() {
                      expect(receivedBefore).to.eql(true);
                      expect(receivedAfter).to.eql(true);
                      done();
                    });

                  });

                });

                describe('without an id', function() {

                  it('it should return null', function(done) {

                    dummyRepo.get(function(err, obj) {
                      expect(obj).to.eql(null);
                      done();
                    });

                  });

                });

                describe('with an id of a non-existing record', function() {

                  it('it should return null', function(done) {

                    dummyRepo.get('1234', function(err, obj) {
                      expect(obj).to.eql(null);
                      done();
                    });

                  });

                });

                describe('with an id of an existing record', function() {

                  it('it should return a new object with the data of the record that matches the given id', function(done) {

                    dummyWriteRepo.get('2345', function(err, obj) {
                      obj.set('foo', 'bar');
                      dummyWriteRepo.commit(obj, function(err) {
                        dummyRepo.get(obj.id, function(err, obj2) {
                          expect(obj2.id).to.eql(obj.id);
                          expect(obj2.get('foo')).to.eql('bar');
                          done();
                        });
                      });
                    });

                  });

                  it('the returned object should have an actionOnCommit of update', function(done) {

                    dummyWriteRepo.get('3456', function(err, obj) {
                      obj.set('foo', 'bar');
                      dummyWriteRepo.commit(obj, function(err) {
                        dummyRepo.get(obj.id, function(err, obj2) {
                          expect(obj2).to.have.property('actionOnCommit', 'update');
                          done();
                        });
                      });
                    });

                  });

                });

              });

              describe('calling find', function() {

                describe('subscribing to before/after-database-find', function() {

                  it('it should emit the correct event', function(done) {

                    var receivedBefore = false;
                    var receivedAfter = false;
                    dummyRepo.on('before-database-find', function() { receivedBefore = true; });
                    dummyRepo.on('after-database-find', function() { receivedAfter = true; });

                    dummyRepo.find(function() {
                      expect(receivedBefore).to.eql(true);
                      expect(receivedAfter).to.eql(true);
                      done();
                    });

                  });

                });

                describe('without a query object', function() {

                  describe('having no records', function() {

                    it('it should return an empty array', function(done) {

                      dummyRepo.find(function(err, results) {
                        expect(results).to.be.an('array');
                        expect(results).to.have.length(0);
                        expect(results.toJSON).to.be.a('function');
                        done();
                      });

                    });

                  });

                  describe('having any records', function() {

                    beforeEach(function(done) {

                      dummyWriteRepo.get('4567', function(err, vm) {
                        dummyWriteRepo.commit(vm, function(err) {
                          dummyWriteRepo.get('4568', function(err, vm) {
                            dummyWriteRepo.commit(vm, done);
                          });
                        });
                      });

                    });

                    it('it should return all records within an array', function(done) {

                      dummyRepo.get('4567', function(err, vm1) {
                        dummyRepo.get('4568', function(err, vm2) {
                          dummyRepo.find(function(err, results) {
                            expect(results).to.have.length(2);
                            expect(results.toJSON).to.be.a('function');
                            expect(results[0].id === vm1.id || results[1].id === vm1.id);
                            expect(results[0].id === vm2.id || results[1].id === vm2.id);
                            done();
                          });
                        });
                      });

                    });

                    describe('calling toJSON on a result array', function() {

                      it('it should return the correct data', function (done) {

                        dummyWriteRepo.get('4567', function(err, vm1) {
                          vm1.set('my', 'data');
                          vm1.commit(function(err) {
                            dummyWriteRepo.get('4568', function(err, vm2) {
                              dummyRepo.find(function(err, results) {
                                var res = results.toJSON();
                                expect(res[0].id === vm1.id || res[1].id === vm1.id);
                                expect(res[0].id === vm2.id || res[1].id === vm2.id);
                                expect(res[0].my === 'data' || res[1].my === 'data');
                                done();
                              });
                            });
                          });
                        });

                      });

                    });

                    it('the containing objects should have an actionOnCommit property', function(done) {

                      dummyRepo.get('4567', function(err, vm1) {
                        dummyRepo.get('4568', function(err, vm2) {
                          dummyRepo.find(function(err, results) {
                            expect(results[0]).to.be.a(ViewModel);
                            expect(results[1]).to.be.a(ViewModel);
                            done();
                          });
                        });
                      });

                    });

                    it('the containing objects should have a set and a get and a destroy and a commit function', function(done) {

                      dummyRepo.get('4567', function(err, vm1) {
                        dummyRepo.get('4568', function(err, vm2) {
                          dummyRepo.find(function(err, results) {
                            expect(results[0]).to.be.a(ViewModel);
                            expect(results[1]).to.be.a(ViewModel);
                            done();
                          });
                        });
                      });

                    });

                  });

                });

                var limitedCompatabilityTypes = ['redis'];

                if (!_.includes(limitedCompatabilityTypes, type)) {

                  describe('with a query object', function() {

                    describe('having no records', function() {

                      it('it should return an empty array', function(done) {

                        dummyRepo.find({}, function(err, results) {
                          expect(results).to.be.an('array');
                          expect(results).to.have.length(0);
                          done();
                        });

                      });

                    });

                    describe('having any records', function() {

                      beforeEach(function(done) {

                        dummyWriteRepo.get('4567', function(err, vm) {
                          vm.set('foo', 'bar');

                          dummyWriteRepo.commit(vm, function(err) {
                            dummyWriteRepo.get('4568', function(err, vm2) {

                              vm2.set('foo', 'wat');
                              dummyWriteRepo.commit(vm2, done);
                            });
                          });
                        });

                      });

                      describe('not matching the query object', function() {

                        it('it should return an empty array', function(done) {

                          var query = { foo: 'bas' };
                          // elasticsearch6 special case, as it does not supports only native queries
                          if (type==='elasticsearch6') {
                            query = {
                              bool: {
                                filter: {
                                  term: {
                                    foo: 'bas'
                                  }
                                }
                              }
                            }
                          }

                          dummyRepo.find(query, function(err, results) {
                            expect(results).to.be.an('array');
                            expect(results).to.have.length(0);
                            done();
                          });

                        });

                      });

                      describe('matching the query object', function() {

                        it('it should return all matching records within an array', function(done) {

                          var query = { foo: 'bar' };
                          // elasticsearch6 special case, as it does not supports only native queries
                          if (type==='elasticsearch6') {
                            query = {
                                bool: {
                                  filter: {
                                    term: {
                                      foo: 'bar'
                                    }
                                  }
                                }
                            }
                          }

                          dummyRepo.find(query, function(err, results) {
                            expect(results).to.be.an('array');
                            expect(results).to.have.length(1);
                            done();
                          });

                        });

                      });

                      var noQueryArray = ['azuretable', 'documentdb', 'dynamodb'];

                      if (!_.includes(noQueryArray, type)) {

                        describe('matching the query object, that queries an array', function () {

                          beforeEach(function (done) {

                            dummyWriteRepo.get('4567', function (err, vm) {
                              vm.set('foos', [
                                {foo: 'bar' }
                              ]);
                              dummyWriteRepo.commit(vm, done);
                            });

                          });

                          it('it should return all matching records within an array', function (done) {

                            var query = { 'foos.foo': 'bar' };
                            // elasticsearch6 special case, as it does not supports only native queries
                            if (type==='elasticsearch6') {
                              query = {
                                bool: {
                                  filter: {
                                    term: {
                                      'foos.foo': 'bar'
                                    }
                                  }
                                }
                              }
                            }

                            dummyRepo.find(query, function (err, results) {
                              expect(results).to.be.an('array');
                              expect(results).to.have.length(1);
                              done();
                            });

                          });

                        });

                      }

                    });

                  });

                }

                describe('with query options', function () {

                  beforeEach(function(done) {

                    cleanRepo(function() {
                      dummyWriteRepo.get('4567', function(err, vm) {
                        vm.set('foo', 'bar');

                        dummyWriteRepo.commit(vm, function(err) {
                          dummyWriteRepo.get('4568', function(err, vm2) {

                            vm2.set('foo', 'wat');
                            dummyWriteRepo.commit(vm2, function(err) {
                              dummyWriteRepo.get('4569', function(err, vm3) {

                                vm3.set('foo', 'bit');
                                dummyWriteRepo.commit(vm3, done);
                              });
                            });
                          });
                        });
                      });
                    });

                  });

                  describe('for paging limit: 2, skip: 1', function () {

                    it('it should work as expected', function (done) {
                      var queryOptions = { limit: 2, skip: 1 };

                      if (type === 'elasticsearch6')
                        queryOptions = {from: 1, size: 2};

                      dummyRepo.find({}, queryOptions, function (err, results) {
                        expect(results).to.be.an('array');
                        expect(results.length).to.eql(2);
                        expect(results.toJSON).to.be.a('function');
                        expect(results[0].get('foo') === 'wat' || results[1].get('foo') === 'wat');
                        expect(results[0].get('foo') === 'bit' || results[1].get('foo') === 'bit');

                        done();
                      });

                    });

                  });

                });

              });

              describe('calling findOne', function() {

                describe('subscribing to before/after-database-findOne', function() {

                  it('it should emit the correct event', function(done) {

                    var receivedBefore = false;
                    var receivedAfter = false;
                    dummyRepo.on('before-database-findOne', function() { receivedBefore = true; });
                    dummyRepo.on('after-database-findOne', function() { receivedAfter = true; });

                    dummyRepo.findOne(function() {
                      expect(receivedBefore).to.eql(true);
                      expect(receivedAfter).to.eql(true);
                      done();
                    });

                  });

                });

                describe('without a query object', function() {

                  describe('having no records', function() {

                    it('it should return an empty array', function(done) {

                      dummyRepo.findOne(function(err, result) {
                        expect(result).not.to.be.ok();
                        done();
                      });

                    });

                  });

                  describe('having any records', function() {

                    beforeEach(function(done) {

                      dummyWriteRepo.get('4567', function(err, vm) {
                        dummyWriteRepo.commit(vm, function(err) {
                          dummyWriteRepo.get('4568', function(err, vm) {
                            dummyWriteRepo.commit(vm, done);
                          });
                        });
                      });

                    });

                    it('it should return all records within an array', function(done) {

                      dummyRepo.get('4567', function(err, vm1) {
                        dummyRepo.get('4568', function(err, vm2) {
                          dummyRepo.findOne(function(err, result) {
                            expect(result.id === vm1.id);
                            done();
                          });
                        });
                      });

                    });

                    describe('calling toJSON on a result array', function() {

                      it('it should return the correct data', function (done) {

                        dummyWriteRepo.get('4567', function(err, vm1) {
                          vm1.set('my', 'data');
                          vm1.commit(function(err) {
                            dummyWriteRepo.get('4568', function(err, vm2) {
                              dummyRepo.findOne(function(err, result) {
                                var res = result.toJSON();
                                expect(res.id === vm1.id);
                                expect(res.id === vm2.id);
                                expect(res.my === 'data');
                                done();
                              });
                            });
                          });
                        });

                      });

                    });

                    it('the containing objects should have an actionOnCommit property', function(done) {

                      dummyRepo.get('4567', function(err, vm1) {
                        dummyRepo.get('4568', function(err, vm2) {
                          dummyRepo.findOne(function(err, result) {
                            expect(result).to.be.a(ViewModel);
                            done();
                          });
                        });
                      });

                    });

                    it('the containing objects should have a set and a get and a destroy and a commit function', function(done) {

                      dummyRepo.get('4567', function(err, vm1) {
                        dummyRepo.get('4568', function(err, vm2) {
                          dummyRepo.findOne(function(err, result) {
                            expect(result).to.be.a(ViewModel);
                            done();
                          });
                        });
                      });

                    });

                  });

                });

                var limitedCompatabilityTypes = ['redis'];

                if (!_.includes(limitedCompatabilityTypes, type)) {

                  describe('with a query object', function() {

                    describe('having no records', function() {

                      it('it should return an empty array', function(done) {

                        dummyRepo.findOne({}, function(err, result) {
                          expect(result).not.to.be.ok();
                          done();
                        });

                      });

                    });

                    describe('having any records', function() {

                      beforeEach(function(done) {

                        dummyWriteRepo.get('4567', function(err, vm) {
                          vm.set('foo', 'bar');

                          dummyWriteRepo.commit(vm, function(err) {
                            dummyWriteRepo.get('4568', function(err, vm2) {

                              vm2.set('foo', 'wat');
                              dummyWriteRepo.commit(vm2, done);
                            });
                          });
                        });

                      });

                      describe('not matching the query object', function() {

                        it('it should return a falsy value', function(done) {

                          var query = { foo: 'bas' };
                          // elasticsearch6 special case, as it does not supports only native queries
                          if (type==='elasticsearch6') {
                            query = {
                              bool: {
                                filter: {
                                  term: {
                                    foo: 'bas'
                                  }
                                }
                              }
                            }
                          }

                          dummyRepo.findOne(query, function(err, result) {
                            expect(result).not.to.be.ok();
                            done();
                          });

                        });

                      });

                      describe('matching the query object', function() {

                        it('it should return one matching record', function(done) {

                          var query = { foo: 'bar' };
                          // elasticsearch6 special case, as it does not supports only native queries
                          if (type==='elasticsearch6') {
                            query = {
                                bool: {
                                  filter: {
                                    term: {
                                      foo: 'bar'
                                    }
                                  }
                                }
                            }
                          }

                          dummyRepo.findOne(query, function(err, result) {
                            expect(result).to.be.ok();
                            done();
                          });

                        });

                      });

                      var noQueryArray = ['azuretable', 'documentdb', 'dynamodb'];

                      if (!_.includes(noQueryArray, type)) {

                        describe('matching the query object, that queries an array', function () {

                          beforeEach(function (done) {

                            dummyWriteRepo.get('4567', function (err, vm) {
                              vm.set('foos', [
                                {foo: 'bar' }
                              ]);
                              dummyWriteRepo.commit(vm, done);
                            });

                          });

                          it('it should return all matching records within an array', function (done) {

                            var query = { 'foos.foo': 'bar' };
                            // elasticsearch6 special case, as it does not supports only native queries
                            if (type==='elasticsearch6') {
                              query = {
                                bool: {
                                  filter: {
                                    term: {
                                      'foos.foo': 'bar'
                                    }
                                  }
                                }
                              }
                            }

                            dummyRepo.findOne(query, function (err, result) {
                              expect(result).to.be.ok();
                              done();
                            });

                          });

                        });

                      }

                    });

                  });

                }

              });

              describe('calling commit', function() {

                beforeEach(function(done) {

                  dummyWriteRepo.get('4567', function(err, vm) {
                    dummyWriteRepo.commit(vm, function(err) {
                      dummyWriteRepo.get('4568', function(err, vm) {
                        dummyWriteRepo.commit(vm, done);
                      });
                    });
                  });

                });

                it('it should throw an error', function(done) {

                  dummyRepo.get('4568', function(err, vm) {
                    expect(function() {
                      dummyRepo.commit(vm, function(err) {
                        expect(err).to.be.ok();
                        done();
                      });
                    }).to.throwError();
                  });

                });

              });

              describe('calling clear', function() {

                beforeEach(function(done) {

                  dummyWriteRepo.get('4567', function(err, vm) {
                    dummyWriteRepo.commit(vm, function(err) {
                      dummyWriteRepo.get('4568', function(err, vm) {
                        dummyWriteRepo.commit(vm, done);
                      });
                    });
                  });

                });

                it('it should throw an error', function(done) {

                  expect(function() {
                    dummyRepo.clear(function(err) {
                      expect(err).to.be.ok();
                      dummyRepo.get('4567', function(err, vm) {
                        expect(err).not.to.be.ok();
                        expect(vm).to.be.ok();
                        done();
                      });
                    });
                  }).to.throwError();

                });

              });

            });

          });

        });

      });

    });

  });

});
