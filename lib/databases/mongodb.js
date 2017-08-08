'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    mongo = Repository.use('mongodb'),
    mongoVersion = Repository.use('mongodb/package.json').version,
    isNew = mongoVersion.indexOf('1.') !== 0,
    ObjectID = isNew ? mongo.ObjectID : mongo.BSONPure.ObjectID,
    _ = require('lodash'),
    async = require('async'),
    collections = [];

function Mongo (options) {
  Repository.call(this, options);

  var defaults = {
    host: 'localhost',
    port: 27017,
    dbName: 'context'//,
    // heartbeat: 60 * 1000
  };

  _.defaults(options, defaults);

  var defaultOpt = {
    ssl: false
  };

  options.options = options.options || {};

  if (isNew) {
    defaultOpt.autoReconnect = false;
    _.defaults(options.options, defaultOpt);
  } else {
    defaultOpt.auto_reconnect = false;
    _.defaults(options.options, defaultOpt);
  }

  this.options = options;
}

util.inherits(Mongo, Repository);

_.extend(Mongo.prototype, {

  connect: function (callback) {
    var self = this;

    var options = this.options;

    var connectionUrl;

    if (options.url) {
      connectionUrl = options.url;
    } else {
      var members = options.servers
        ? options.servers
        : [{host: options.host, port: options.port}];

      var memberString = _(members).map(function(m) { return m.host + ':' + m.port; });
      var authString = options.username && options.password
        ? options.username + ':' + options.password + '@'
        : '';
      var optionsString = options.authSource
        ? '?authSource=' + options.authSource
        : '';

      connectionUrl = 'mongodb://' + authString + memberString + '/' + options.dbName + optionsString;
    }

    var client = new mongo.MongoClient();

    client.connect(connectionUrl, options.options, function(err, db) {
      if (err) {
        if (callback) callback(err);
      } else {
        self.db = db;

        self.db.on('close', function() {
          self.emit('disconnect');
          self.stopHeartbeat();
        });

        var finish = function (err) {
          self.isConnected = true;
          if (!err) {
            self.emit('connect');

            if (self.options.heartbeat) {
              self.startHeartbeat();
            }
          }
          if (callback) callback(err, self);
        };

        finish();
      }
    });
  },

  stopHeartbeat: function () {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      delete this.heartbeatInterval;
    }
  },

  startHeartbeat: function () {
    var self = this;

    var gracePeriod = Math.round(this.options.heartbeat / 2);
    this.heartbeatInterval = setInterval(function () {
      var graceTimer = setTimeout(function () {
        if (self.heartbeatInterval) {
          console.error((new Error ('Heartbeat timeouted after ' + gracePeriod + 'ms (mongodb)')).stack);
          self.disconnect();
        }
      }, gracePeriod);

      self.db.command({ ping: 1 }, function (err) {
        if (graceTimer) clearTimeout(graceTimer);
        if (err) {
          console.error(err.stack || err);
          self.disconnect();
        }
      });
    }, this.options.heartbeat);
  },

  disconnect: function (callback) {
    this.stopHeartbeat();

    if (!this.db) {
      if (callback) callback(null);
      return;
    }

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
          if (isNew) {
            if (modifiedCount && modifiedCount.result && modifiedCount.result.n === 0) {
              return callback(new ConcurrencyError());
            }
          } else {
            if (modifiedCount === 0) {
              return callback(new ConcurrencyError());
            }
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
          if (isNew) {
            if (modifiedCount && modifiedCount.result && modifiedCount.result.n === 0) {
              return callback(new ConcurrencyError());
            }
          } else {
            if (modifiedCount === 0) {
              return callback(new ConcurrencyError());
            }
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

    var indexes = (this.repositorySettings &&  this.repositorySettings.mongodb && this.repositorySettings.mongodb.indexes) ? this.repositorySettings.mongodb.indexes : this.indexes 

    if (!this.isConnected || !this.collectionName || !indexes) return;

    indexes.forEach(function(index) {
      var options;

      index = index.index ? index.index : index;
      options = index.options ? index.options : {};

      if (typeof index === 'string') {
        var key = index;
        index = {};
        index[key] = 1;
      }

      self.db.ensureIndex(self.collectionName, index, options, function(err, indexName) {
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

    // this.db.createCollection(this.collectionName); // precreate the collection so the first commit is faster

    this.collection = this.db.collection(this.collectionName);

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
      (self.db.collection(col)).remove({}, { safe: true }, callback);
    }, callback);
  }

});

module.exports = Mongo;
