'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    tingodb = require('tingodb')({
      searchInArray: true
    }),
    ObjectID = tingodb.ObjectID,
    _ = require('lodash');

function Tingo (options) {
  Repository.call(this, options);

  var defaults = {
    dbPath: require('path').join(__dirname, '../../'),
  };

  _.defaults(options, defaults);

  this.options = options;
}

util.inherits(Tingo, Repository);

_.extend(Tingo.prototype, {

  connect: function (callback) {
    var self = this;

    var options = this.options;

    this.db = new tingodb.Db(options.dbPath, {});
    // this.db.on('close', function() {
    //   self.emit('disconnect');
    // });

    this.emit('connect');
    if (callback) callback(null, this);
  },

  disconnect: function (callback) {
    if (!this.db) {
      if (callback) callback(null);
      return;
    }

    this.emit('disconnect');
    this.db.close(callback || function () {});
  },

  getNewId: function(callback) {
    this.checkConnection();

    callback(null, new ObjectID().toString());
  },

  get: function(id, callback) {

    this.checkConnection();

    if(_.isFunction(id)) {
      callback = id;
      id = null;
    }

    if (!id) {
      id = new ObjectID().toString();
    }

    var self = this;

    this.collection.findOne({ _id: id }, function(err, data) {
      if (err) {
        return callback(err);
      }

      if (!data) {
        return callback(null, new ViewModel({ id: id }, self));
      }

      var vm = new ViewModel(data, self);
      vm.actionOnCommit = 'update';
      callback(null, vm);
    });
  },

  find: function(query, callback) {

    this.checkConnection();

    callback = callback || query;
    query = arguments.length === 2 ? query : {};

    var self = this;

    this.collection.find(query).toArray(function(err, vms) {

      // Map to view models
      vms = _.map(vms, function(data) {
        var vm = new ViewModel(data, self);
        vm.actionOnCommit = 'update';
        return vm;
      });

      callback(err, vms);
    });

  },

  commit: function(vm, callback) {

    this.checkConnection();
    
    if(!vm.actionOnCommit) return callback(new Error());

    var obj;

    switch(vm.actionOnCommit) {
      case 'delete':
        this.collection.remove({ _id: vm.id }, { safe: true }, callback);
        break;
      case 'create':
        vm.set('_hash', new ObjectID().toString());
        obj = vm.toJSON();
        obj._id = obj.id;
        this.collection.insert(obj, { safe: true }, function(err) {
          if (err && err.message && err.message.indexOf('duplicate key') >= 0) {
            return callback(new ConcurrencyError());
          }
          vm.actionOnCommit = 'update';
          callback(err, vm);
        });
        break;
      case 'update':
        var currentHash = vm.get('_hash');
        vm.set('_hash', new ObjectID().toString());
        obj = vm.toJSON();
        obj._id = obj.id;
        var query = { _id: obj._id };
        if (currentHash) {
          query._hash = currentHash;
        }
        this.collection.update(query, obj, { safe: true, upsert: !currentHash }, function(err, modifiedCount) {
          if (modifiedCount === 0) {
            return callback(new ConcurrencyError());
          }
          vm.actionOnCommit = 'update';
          callback(err, vm);
        });
        break;
      default:
        return callback(new Error());
    }

  },

  checkConnection: function(callback) {
    if (this.collection) {
      return;
    }

    this.collection = this.db.createCollection(this.collectionName + '.tingo');
  }

});

module.exports = Tingo;
