'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    tingodb = Repository.use('tingodb')({
      searchInArray: true
    }),
    ObjectID = tingodb.ObjectID,
    _ = require('lodash'),
    async = require('async'),
    collections = [];

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

  find: function(query, queryOptions, callback) {

    this.checkConnection();

    var self = this;

    this.collection.find(query, queryOptions).toArray(function(err, vms) {

      // Map to view models
      vms = _.map(vms, function(data) {
        var vm = new ViewModel(data, self);
        vm.actionOnCommit = 'update';
        return vm;
      });

      callback(err, vms);
    });

  },

  findOne: function(query, queryOptions, callback) {

    this.checkConnection();

    var self = this;

    this.collection.findOne(query, queryOptions, function(err, data) {
      if (err) {
        return callback(err);
      }

      if (!data) {
        return callback(null, null);
      }

      var vm = new ViewModel(data, self);
      vm.actionOnCommit = 'update';
      callback(null, vm);
    });

  },

  commit: function(vm, callback) {

    this.checkConnection();

    if(!vm.actionOnCommit) return callback(new Error());

    var obj;

    switch(vm.actionOnCommit) {
      case 'delete':
        if (!vm.has('_hash')) {
          return callback(null);
        }
        this.collection.remove({ _id: vm.id, _hash: vm.get('_hash') }, { safe: true }, function(err, modifiedCount) {
          if (modifiedCount === 0) {
            return callback(new ConcurrencyError());
          }
          callback(err);
        });
        break;
      case 'create':
        vm.set('_hash', new ObjectID().toString());
        // obj = vm.toJSON();
        obj = vm.attributes;
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
        // obj = vm.toJSON();
        obj = vm.attributes;
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

  ensureIndexes: function() {
    var self = this;

    if (!this.collectionName || !this.indexes) return;

    this.indexes.forEach(function(index) {
      var options;

      index = index.index ? index.index : index;
      options = index.options ? index.options : {};

      if (typeof index === 'string') {
        var key = index;
        index = {};
        index[key] = 1;
      }

      self.collection.ensureIndex(index, options, function(err, indexName) {
        // nothing todo.
      });
    });
  },

  checkConnection: function(doNotEnsureIndexes) {
    if (this.collection) {
      return;
    }

    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName)
    }

    this.collection = this.db.createCollection(this.collectionName + '.tingo');

    if (doNotEnsureIndexes) return;

    this.ensureIndexes();
  },

  clear: function (callback) {
    this.checkConnection(true);

    if (!this.collection) {
      if (callback) callback(null);
      return;
    }

    this.collection.remove({}, { safe: true }, function (err) {
      if (callback) {
        callback(err);
      }
    });
  },

  clearAll: function (callback) {
    var self = this;
    async.each(collections, function (col, callback) {
      self.db.createCollection(col + '.tingo').remove({}, { safe: true }, callback);
    }, callback);
  }

});

module.exports = Tingo;
