var expect = require('expect.js'),
    ViewModel = require('../lib/viewmodel'),
    Repository = require('../lib/base');

var repo = new Repository();

describe('ViewModel', function() {

  describe('creating a ViewModel', function() {

    describe('without repository', function() {

      it('it should throw an error', function() {

        expect(function() {
          new ViewModel({ data: 'other stuff' });
        }).to.throwError();

      });

    });

    describe('with all needed arguments', function() {

      it('it should return a correct object', function() {

        var vm = new ViewModel({ data: 'other stuff' }, repo);

        expect(vm).to.be.an('object');
        expect(vm.set).to.be.a('function');
        expect(vm.get).to.be.a('function');
        expect(vm.has).to.be.a('function');
        expect(vm.toJSON).to.be.a('function');
        expect(vm.commit).to.be.a('function');
        expect(vm.actionOnCommit).to.eql('create');

      });

      describe('passing with an id attribute', function() {

        it('it should return an object with that id set on that vm', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          expect(vm.id).to.eql('my id');

        });

      });

    });

    describe('calling has', function() {

      describe('of an attribute that does exist', function() {

        it('it should return true', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          expect(vm.has('data')).to.eql(true);

        });

      });

      describe('of an attribute that does not exist', function() {

        it('it should return false', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          expect(vm.has('data222')).to.eql(false);

        });

      });

    });

    describe('calling get', function() {

      describe('of an attribute that does exist', function() {

        it('it should return that value', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          expect(vm.get('data')).to.eql('other stuff');

        });

      });

      describe('of an attribute that does not exist', function() {

        it('it should return undefined', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          expect(vm.get('data222')).to.eql(undefined);

        });

      });

      describe('of an attribute that is deep', function() {

        it('it should return that value', function() {

          var vm = new ViewModel({ id: 'my id', deep: { data: 'other stuff' } }, repo);

          expect(vm.get('deep.data')).to.eql('other stuff');

        });

      });

    });

    describe('calling set', function() {

      describe('with a simple key', function() {

        it('it should set it correctly', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          vm.set('data', 'a');
          expect(vm.get('data')).to.eql('a');

        });

      });

      describe('with a path as key', function() {

        it('it should set it correctly', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          vm.set('path.sub', 'b');
          expect(vm.get('path.sub')).to.eql('b');

        });

      });

      describe('with an object', function() {

        it('it should set it correctly', function() {

          var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);

          vm.set({ tree: 'a', bee: { oh: '3' } });
          expect(vm.get('tree')).to.eql('a');
          expect(vm.get('bee.oh')).to.eql('3');

        });

      });

    });

    describe('calling destroy', function() {

      it('it should mark the vm as to be deleted', function() {

        var vm = new ViewModel({ id: 'my id', data: 'other stuff' }, repo);
        vm.destroy();

        expect(vm.actionOnCommit).to.eql('delete');

      });

    });

    describe('calling toJSON', function() {

      it('it should return all attributes as Javascript object', function() {

        var vm = new ViewModel({ id: 'my id', data: 'other stuff', deeper: { a: 'b' } }, repo);
        var json = vm.toJSON();

        expect(json.id).to.eql('my id');
        expect(json.data).to.eql('other stuff');
        expect(json.deeper.a).to.eql('b');

      });

    });

    describe('calling commit', function() {

      it('it should call the commit function on the repository', function(done) {

        var dummyRepo = new Repository();
        dummyRepo.commit = function(toSave, callback) {
          expect(toSave).to.eql(vm);
          done();
        };

        var vm = new ViewModel({ id: 'my id', data: 'other stuff', deeper: { a: 'b' } }, dummyRepo);
        vm.commit();

      });

    });

  });

});