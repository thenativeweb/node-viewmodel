'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    uuid = require('node-uuid').v4,
    redis = require('redis'),
    jsondate = require('jsondate'),
    async = require('async'),
    _ = require('lodash');

function Redis (options) {
  Repository.call(this, options);

  var defaults = {
    host: 'localhost',
    port: 6379,
    max_attempts: 1
  };

  _.defaults(options, defaults);

  if (options.url) {
    var url = require('url').parse(options.url);
    if (url.protocol === 'redis:') {
      if (url.auth) {
        var userparts = url.auth.split(":");
        options.user = userparts[0];
        if (userparts.length === 2) {
          options.password = userparts[1];
        }
      }
      options.host = url.hostname;
      options.port = url.port;
      if (url.pathname) {
        options.db   = url.pathname.replace("/", "", 1);
      }
    }
  }

  this.options = options;
}

util.inherits(Redis, Repository);

_.extend(Redis.prototype, {

  connect: function (callback) {
    var self = this;

    var options = this.options;

    this.client = new redis.createClient(options.port || options.socket, options.host, options);

    this.prefix = options.prefix;

    var calledBack = false;

    if (options.password) {
      this.client.auth(options.password, function(err) {
        if (err && !calledBack && callback) {
          calledBack = true;
          if (callback) callback(err, self);
          return;
        }
        if (err) throw err;
      });
    }

    if (options.db) {
      this.client.select(options.db);
    }

    this.client.on('end', function () {
      self.disconnect();
    });

    this.client.on('error', function (err) {
      console.log(err);

      if (calledBack) return;
      calledBack = true;
      if (callback) callback(null, self);
    });

    this.client.on('connect', function () {
      if (options.db) {
        self.client.send_anyways = true;
        self.client.select(options.db);
        self.client.send_anyways = false;
      }
      
      self.emit('connect');

      if (calledBack) return;
      calledBack = true;
      if (callback) callback(null, self);
    });
  },

  disconnect: function (callback) {
    this.client.end();
    this.emit('disconnect');
    if (callback) callback(null, this);
  },

  getNewId: function (callback) {
    this.checkConnection();

    this.client.incr('nextItemId:' + this.prefix, function(err, id) {
      if (err) {
        return callback(err);
      }
      callback(null, id.toString());
    });
  },

  get: function(id, callback) {

    this.checkConnection();

    if(_.isFunction(id)) {
      callback = id;
      id = null;
    }

    var self = this;

    function getObj(id, clb) {
      var prefixedId = self.prefix + ':' + id;

      self.client.get(prefixedId, function (err, data) {
        if (err) {
          if (callback) callback(err);
          return;
        }

        if (!data) {
          return callback(null, new ViewModel({ id: id }, self));
        }

        var item;

        try {
          item = jsondate.parse(data.toString());
        } catch (error) {
          if (callback) callback(err);
          return;
        }

        var vm = new ViewModel(item, self);
        vm.actionOnCommit = 'update';
        callback(null, vm);
      });
    }

    if (!id) {
      this.getNewId(function(err, id) {
        if (err) {
          return callback(err);
        }
        getObj(id, callback);
      });
      return;
    }

    getObj(id, callback);
  },

  find: function(query, queryOptions, callback) {

    this.checkConnection();

    var self = this;
    this.client.keys(this.prefix + ':*', function(err, docs) {
      if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
        docs = docs.slice(queryOptions.skip, queryOptions.limit + queryOptions.skip + 1);
      }

      // docs.reverse();
      async.map(docs, function(doc, callback) {
        self.client.get(doc, function (err, data) {
          if (err) {
            if (callback) callback(err);
            return;
          }
          if (!data) {
            if (callback) callback(null, null);
            return;
          }

          var result;

          try {
            result = jsondate.parse(data.toString());
          } catch (error) {
            if (callback) callback(err);
            return;
          }

          var vm = new ViewModel(result, self);
          vm.actionOnCommit = 'update';

          if (callback) callback(null, vm);
        });
      }, callback);
    });

  },

  commit: function (vm, callback) {

    this.checkConnection();
    
    if(!vm.actionOnCommit) return callback(new Error());

    var prefixedId = this.prefix + ':' + vm.id;

    var obj;

    var self = this;

    switch(vm.actionOnCommit) {
      case 'delete':
        this.client.del(prefixedId, callback);
        break;
      case 'create':
        this.client.get(prefixedId, function (err, data) {
          if (err) {
            if (callback) callback(err);
            return;
          }
          if (!!data) {
            return callback(new ConcurrencyError());
          }

          self.get(vm.id, function(err, savedVm) {
            if (err) {
              return callback(err);
            }
            var currentHash = savedVm.get('_hash');
            if (currentHash && vm.has('_hash') && vm.get('_hash') != currentHash) {
              return callback(new ConcurrencyError());
            }
            vm.set('_hash', uuid().toString());
            try {
              obj = JSON.stringify(vm);
            } catch (err2) {
              if (callback) callback(err2);
            }
            self.client.set(prefixedId, obj, function(err) {
              vm.actionOnCommit = 'update';
              callback(err, vm);
            });
          });
        });
        break;
        // Intended Fall-through
      case 'update':
        this.get(vm.id, function(err, savedVm) {
          if (err) {
            return callback(err);
          }
          var currentHash = savedVm.get('_hash');
          if (currentHash && vm.has('_hash') && vm.get('_hash') != currentHash) {
            return callback(new ConcurrencyError());
          }
          vm.set('_hash', uuid().toString());
          try {
            obj = JSON.stringify(vm);
          } catch (err2) {
            if (callback) callback(err2);
          }
          self.client.set(prefixedId, obj, function(err) {
            vm.actionOnCommit = 'update';
            callback(err, vm);
          });
        });
        break;
      default:
        return callback(new Error());
    }

  },

  checkConnection: function() {
    if (this.collection) {
      return;
    }

    this.prefix = this.collectionName;
  }

});

module.exports = Redis;
