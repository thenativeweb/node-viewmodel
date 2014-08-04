var expect = require('expect.js'),
    async = require('async'),
    _ = require('lodash'),
    repository = require('../lib/repository'),
    ConcurrencyError = require('../lib/concurrencyError'),
    Base = require('../lib/base'),
    ViewModel = require('../lib/viewmodel'),
    InMemory = require('../lib/databases/inmemory');

function cleanRepo(repo, done) {
  repo.find(function(err, results) {
    async.forEach(results, function(item, callback) {
      item.destroy();
      repo.commit(item, callback);
    }, function(err) {
      if (!err) done();
    });
  });
}

describe('Repository write', function() {

  describe('calling write', function() {

    describe('without options', function() {

      it('it should return with the in memory repository', function() {

        var repo = repository.write();
        expect(repo).to.be.a('object');

      });

      describe('but with a callback', function() {

        it('it should callback with repository object', function(done) {

          repository.write(function(err, repo) {
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
          repository.write({ type: 'strangeDb' });
        }).to.throwError();

      });

      it('it should callback with an error', function(done) {

        expect(function() {
          repository.write({ type: 'strangeDb' }, function(err) {
            expect(err).to.be.ok();
            done();
          });
        }).to.throwError();

      });
      
    });

    describe('with options of an own db implementation', function() {

      it('it should return with the an instance of that implementation', function() {

        var repo = repository.write(InMemory);
        expect(repo).to.be.a(InMemory);

      });
      
    });

    describe('with options containing a type property with the value of', function() {

      var types = ['inmemory', 'mongodb', 'tingodb', 'couchdb', 'redis'];

      types.forEach(function(type) {

        describe('"' + type + '"', function() {

          var repo;

          describe('without callback', function() {

            afterEach(function(done) {
              repo.disconnect(done);
            });

            it('it should emit connect', function(done) {

              repo = repository.write({ type: type });
              repo.once('connect', done);

            });
          
            it('it should return with the correct repository', function() {

              repo = repository.write({ type: type });
              expect(repo).to.be.a('object');
              expect(repo.connect).to.be.a('function');
              expect(repo.disconnect).to.be.a('function');
              expect(repo.getNewId).to.be.a('function');
              expect(repo.get).to.be.a('function');
              expect(repo.find).to.be.a('function');
              expect(repo.commit).to.be.a('function');
              expect(repo.checkConnection).to.be.a('function');
              expect(repo.extend).to.be.a('function');

            });

          });

          describe('with callback', function() {

            afterEach(function(done) {
              repo.disconnect(done);
            });
          
            it('it should return with the correct repository', function(done) {

              repository.write({ type: type }, function(err, resR) {
                repo = resR;
                expect(resR).to.be.a('object');
                done();
              });

            });

          });

          describe('having connected', function() {
          
            describe('calling disconnect', function() {

              beforeEach(function(done) {
                repository.write({ type: type }, function(err, resR) {
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
                repository.write({ type: type }, function(err, resR) {
                  repo = resR;
                  dummyRepo = repo.extend({
                    collectionName: 'dummies'
                  });
                  done();
                });
              });

              beforeEach(function(done) {
                cleanRepo(dummyRepo, done);
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

                describe('without an id', function() {

                  it('it should return a new object with a new id', function(done) {

                    dummyRepo.get(function(err, obj) {
                      expect(obj).to.be.a(ViewModel);
                      expect(obj.id).to.be.ok();
                      done();
                    });

                  });

                });

                describe('with an id of a non-existing record', function() {

                  it('it should return a new object with the given id', function(done) {

                    dummyRepo.get('1234', function(err, obj) {
                      expect(obj.id).to.eql('1234');
                      done();
                    });

                  });

                  it('the returned object should have an actionOnCommit of create', function(done) {

                    dummyRepo.get('1234', function(err, obj) {
                      expect(obj).to.have.property('actionOnCommit', 'create');
                      done();
                    });

                  });

                });

                describe('with an id of an existing record', function() {

                  it('it should return a new object with the data of the record that matches the given id', function(done) {

                    dummyRepo.get('2345', function(err, obj) {
                      obj.set('foo', 'bar');
                      dummyRepo.commit(obj, function(err) {
                        dummyRepo.get(obj.id, function(err, obj2) {
                          expect(obj2.id).to.eql(obj.id);
                          expect(obj2.get('foo')).to.eql('bar');
                          done();
                        });
                      });
                    });

                  });

                  it('the returned object should have an actionOnCommit of update', function(done) {

                    dummyRepo.get('3456', function(err, obj) {
                      obj.set('foo', 'bar');
                      dummyRepo.commit(obj, function(err) {
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

                      dummyRepo.get('4567', function(err, vm) {
                        dummyRepo.commit(vm, function(err) {
                          dummyRepo.get('4568', function(err, vm) {
                            dummyRepo.commit(vm, done);
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
                            expect(results[0].id).to.eql(vm1.id);
                            expect(results[1].id).to.eql(vm2.id);
                            done();
                          });
                        });
                      });

                    });

                    describe('calling toJSON on a result array', function() {

                      it('it should return the correct data', function (done) {

                        dummyRepo.get('4567', function(err, vm1) {
                          vm1.set('my', 'data');
                          vm1.commit(function(err) {
                            dummyRepo.get('4568', function(err, vm2) {
                              dummyRepo.find(function(err, results) {
                                var res = results.toJSON();
                                expect(res[0].id).to.eql('4567');
                                expect(res[0].my).to.eql('data');
                                expect(res[1].id).to.eql('4568');
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

                if (!_.contains(limitedCompatabilityTypes, type)) {

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

                        dummyRepo.get('4567', function(err, vm) {
                          vm.set('foo', 'bar');

                          dummyRepo.commit(vm, function(err) {
                            dummyRepo.get('4568', function(err, vm2) {

                              vm.set('foo', 'wat');
                              dummyRepo.commit(vm2, done);
                            });
                          });
                        });

                      });

                      describe('not matching the query object', function() {

                        it('it should return an empty array', function(done) {

                          dummyRepo.find({ foo: 'bas' }, function(err, results) {
                            expect(results).to.be.an('array');
                            expect(results).to.have.length(0);
                            done();
                          });

                        });

                      });


                      describe('matching the query object', function() {

                        it('it should return all matching records within an array', function(done) {

                          dummyRepo.find({ foo: 'bar' }, function(err, results) {
                            expect(results).to.be.an('array');
                            expect(results).to.have.length(1);
                            done();
                          });

                        });

                      });

                      describe('matching the query object, that queries an array', function() {

                        beforeEach(function(done) {

                          dummyRepo.get('4567', function(err, vm) {
                            vm.set('foos', [ { foo: 'bar' } ]);
                            dummyRepo.commit(vm, done);
                          });

                        });

                        it('it should return all matching records within an array', function(done) {

                          dummyRepo.find({ 'foos.foo': 'bar' }, function(err, results) {
                            expect(results).to.be.an('array');
                            expect(results).to.have.length(1);
                            done();
                          });

                        });

                      });

                    });

                  });
                }

              });

              describe('calling commit', function() {

                describe('with a single object', function() {

                  describe('not having an actionOnCommit', function() {

                    it('it should not modify the view model database', function(done) {

                      var obj = {
                        foo: 'bar'
                      };

                      dummyRepo.commit(obj, function(err) {
                        dummyRepo.find(function(err, results) {
                          expect(results).to.be.an('array');
                          expect(results).to.have.length(0);
                          done();
                        });
                      });

                    });

                    it('it should callback with error', function(done) {

                      var obj = {
                        foo: 'bar'
                      };

                      dummyRepo.commit(obj, function(err) {
                        expect(err).to.be.ok();
                        done();
                      });

                    });

                  });

                  describe('having an invalid actionOnCommit', function() {

                    it('it should not modify the view model database', function(done) {

                      var obj = {
                        actionOnCommit: 'nufta',
                        foo: 'bar'
                      };

                      dummyRepo.commit(obj, function(err) {
                        dummyRepo.find(function(err, results) {
                          expect(results).to.be.an('array');
                          expect(results).to.have.length(0);
                          done();
                        });
                      });

                    });

                    it('it should callback with error', function(done) {

                      var obj = {
                        actionOnCommit: 'nufta',
                        foo: 'bar'
                      };

                      dummyRepo.commit(obj, function(err) {
                        expect(err).to.be.ok();
                        done();
                      });

                    });

                  });

                  describe('having an actionOnCommit', function() {

                    beforeEach(function(done) {

                      dummyRepo.get('4567', function(err, vm) {
                        vm.set('foo', 'bar');

                        dummyRepo.commit(vm, function(err) {
                          dummyRepo.get('4568', function(err, vm2) {

                            vm2.set('foo', 'wat');
                            dummyRepo.commit(vm2, done);
                          });
                        });
                      });

                    });

                    describe('of create', function() {

                      describe('on a non-existing record', function() {

                        var obj, retObj;

                        it('it should insert a new record', function(done) {

                          dummyRepo.get('4569', function(err, vm) {
                            vm.set('foo', 'baz');
                            obj = vm;
                            dummyRepo.commit(vm, function(err, ret) {
                              retObj = ret;
                              dummyRepo.get('4569', function(err, vm2) {
                                vm.actionOnCommit = 'update';
                                expect(vm2.id).to.eql(vm.id);
                                expect(vm2.foo).to.eql(vm.foo);
                                done();
                              });
                            });
                          });

                        });

                        describe('and', function() {

                          it('it should return the vm with updated actionOnCommit', function() {

                            expect(obj.id).to.eql(retObj.id);
                            expect(retObj.actionOnCommit).to.eql('update');

                          });

                        });

                      });

                    });

                    describe('of update', function() {

                      describe('on a non-existing record', function() {

                        it('it should insert a new record', function(done) {

                          dummyRepo.get('4569', function(err, vm) {
                            vm.actionOnCommit = 'update';
                            vm.set('foo', 'baz');
                            dummyRepo.commit(vm, function(err) {
                              dummyRepo.get('4569', function(err, vm2) {
                                expect(vm2.id).to.eql(vm.id);
                                expect(vm2.get('foo')).to.eql(vm.get('foo'));
                                done();
                              });
                            });
                          });

                        });

                      });

                      describe('on an existing record', function() {

                        var obj, retObj;

                        it('it should update the existing record', function(done) {

                          dummyRepo.get('4567', function(err, vm) {
                            vm.set('foo', 'baz');
                            obj = vm;
                            dummyRepo.commit(vm, function(err, ret) {
                              retObj = ret;
                              dummyRepo.get('4567', function(err, vm2) {
                                expect(vm2.id).to.eql(vm.id);
                                expect(vm2.get('foo')).to.eql(vm.get('foo'));
                                done();
                              });
                            });
                          });

                        });

                        describe('and', function() {

                          it('it should return the vm with updated actionOnCommit', function() {

                            expect(obj.id).to.eql(retObj.id);
                            expect(retObj.actionOnCommit).to.eql('update');

                          });

                        });

                        describe('but beeing updated by someone else in the meantime', function() {

                          it('it should callback with a concurrency error', function(done) {

                            var org = new ViewModel({id: '456789123'}, dummyRepo);
                            dummyRepo.get('456789123', function(err, vm) {
                              vm.set('foo', 'baz');
                              dummyRepo.commit(vm, function(err, ret) {
                                dummyRepo.get('456789123', function(err, vm2) {
                                  vm2.set('foo', 'baz2');
                                  org.set(vm2.toJSON());
                                  dummyRepo.commit(vm2, function(err, ret) {
                                    dummyRepo.get('456789123', function(err, vm3) {
                                      org.set('foo', 'blablalba');
                                      dummyRepo.commit(org, function(err, ret) {
                                        expect(err).to.be.a(ConcurrencyError);
                                        done();
                                      });
                                    });
                                  });
                                });
                              });
                            });

                          });

                        });

                        describe('but beeing updated by someone else in the meantime and creating with the same id', function() {

                          it('it should callback with a concurrency error', function(done) {

                            dummyRepo.get('6677558899', function(err, vm) {
                              vm.set('foo', 'baz');
                              dummyRepo.get('6677558899', function(err, vm2) {
                                vm.set('foo2', 'bag');
                                dummyRepo.commit(vm, function(err, ret) {
                                  dummyRepo.commit(vm2, function(err, ret) {
                                    expect(err).to.be.a(ConcurrencyError);
                                    done();
                                  });
                                });
                              });
                            });

                          });

                        });

                      });

                    });

                    describe('of delete', function() {

                      describe('on a non-existing record', function() {

                        it('it should not modify the view model database', function(done) {

                          dummyRepo.get('4567123', function(err, vm) {
                            vm.id = '4569123';
                            vm.destroy();

                            dummyRepo.commit(vm, function(err) {
                              dummyRepo.find(function(err, results) {
                                expect(results).to.be.an('array');
                                expect(results).to.have.length(2);
                                done();
                              });
                            });
                          });

                        });

                      });

                      describe('on an existing record', function() {

                        it('it should delete the existing record', function(done) {

                          dummyRepo.get('4567', function(err, vm) {
                            vm.destroy();

                            dummyRepo.commit(vm, function(err) {
                              dummyRepo.find(function(err, results) {
                                expect(results).to.be.an('array');
                                expect(results).to.have.length(1);
                                done();
                              });
                            });
                          });

                        });

                      });

                    });

                  });

                });

                describe('on a single object', function() {

                  describe('having an actionOnCommit', function() {

                    beforeEach(function(done) {

                      dummyRepo.get('4567', function(err, vm) {
                        vm.set('foo', 'bar');

                        dummyRepo.commit(vm, function(err) {
                          dummyRepo.get('4568', function(err, vm2) {

                            vm2.set('foo', 'wat');
                            dummyRepo.commit(vm2, done);
                          });
                        });
                      });

                    });

                    describe('of create', function() {

                      describe('on a non-existing record', function() {

                        it('it should insert a new record', function(done) {

                          dummyRepo.get('4569', function(err, vm) {
                            vm.set('foo', 'baz');
                            vm.commit(function(err) {
                              dummyRepo.get('4569', function(err, vm2) {
                                vm.actionOnCommit = 'update';
                                expect(vm2.id).to.eql(vm.id);
                                expect(vm2.get('foo')).to.eql(vm.get('foo'));
                                done();
                              });
                            });
                          });

                        });

                      });

                    });

                    describe('of update', function() {

                      describe('on a non-existing record', function() {

                        it('it should insert a new record', function(done) {

                          dummyRepo.get('4569', function(err, vm) {
                            vm.actionOnCommit = 'update';
                            vm.set('foo', 'baz');
                            vm.commit(function(err) {
                              dummyRepo.get('4569', function(err, vm2) {
                                expect(vm2.id).to.eql(vm.id);
                                expect(vm2.get('foo')).to.eql(vm.get('foo'));
                                done();
                              });
                            });
                          });

                        });

                      });

                      describe('on an existing record', function() {

                        it('it should update the existing record', function(done) {

                          dummyRepo.get('4567', function(err, vm) {
                            vm.set('foo', 'baz');
                            vm.commit(function(err) {
                              dummyRepo.get('4567', function(err, vm2) {
                                expect(vm2.id).to.eql(vm.id);
                                expect(vm2.get('foo')).to.eql(vm.get('foo'));
                                done();
                              });
                            });
                          });

                        });

                      });

                    });

                    describe('of delete', function() {

                      describe('on a non-existing record', function() {

                        it('it should not modify the view model database', function(done) {

                          dummyRepo.get('4567123', function(err, vm) {
                            vm.id = '4569123';
                            vm.destroy();

                            vm.commit(function(err) {
                              dummyRepo.find(function(err, results) {
                                expect(results).to.be.an('array');
                                expect(results).to.have.length(2);
                                done();
                              });
                            });
                          });

                        });

                      });

                      describe('on an existing record', function() {

                        it('it should delete the existing record', function(done) {

                          dummyRepo.get('4567', function(err, vm) {
                            vm.destroy();

                            vm.commit(function(err) {
                              dummyRepo.find(function(err, results) {
                                expect(results).to.be.an('array');
                                expect(results).to.have.length(1);
                                done();
                              });
                            });
                          });

                        });

                      });

                    });

                  });

                });

              });

            });

          });

        });

      });

    });

	});

});