'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    uuid = require('uuid').v4,
    redis = Repository.use('redis'),
    jsondate = require('jsondate'),
    async = require('async'),
    _ = require('lodash'),
    collections = [];

function Redis (options) {
  Repository.call(this, options);

  var defaults = {
    host: 'localhost',
    port: 6379,
    max_attempts: 1,
    retry_strategy: function (options) {
      return undefined;
    }//,
    // heartbeat: 60 * 1000
  };

  _.defaults(options, defaults);

  if (options.url) {
    var url = require('url').parse(options.url);
    if (url.protocol === 'redis:') {
      if (url.auth) {
        var userparts = url.auth.split(':');
        options.user = userparts[0];
        if (userparts.length === 2) {
          options.password = userparts[1];
        }
      }
      options.host = url.hostname;
      options.port = url.port;
      if (url.pathname) {
        options.db = url.pathname.replace('/', '', 1);
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

    this.client = new redis.createClient(options.port || options.socket, options.host, _.omit(options, 'prefix'));

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
      self.stopHeartbeat();
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

      if (self.options.heartbeat) {
        self.startHeartbeat();
      }

      if (calledBack) return;
      calledBack = true;
      if (callback) callback(null, self);
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
          console.error((new Error ('Heartbeat timeouted after ' + gracePeriod + 'ms (redis)')).stack);
          self.disconnect();
        }
      }, gracePeriod);

      self.client.ping(function (err) {
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

    if (this.client) {
      this.client.end(true);
    }
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

  scan: function (key, cursor, handleKeys, callback) {
    var self = this;

    if (!callback) {
      callback = handleKeys;
      handleKeys = cursor;
      cursor = 0;
    }

    (function scanRecursive (curs) {
      self.client.scan(curs, 'match', key, function (err, res) {
        if (err) {
          return callback(err);
        }

        function next () {
          if (res[0] === '0') {
            callback(null);
          } else {
            scanRecursive(res[0]);
          }
        }

        if (res[1].length === 0) {
          return next();
        }

        handleKeys(res[1], function (err) {
          if (err) {
            return callback(err);
          }
          next();
        });
      });
    })(cursor);
  },

  find: function(query, queryOptions, callback) {

    this.checkConnection();

    var self = this;

    var allKeys = [];

    this.scan(this.prefix + ':*',
      function (keys, fn) {
        allKeys = allKeys.concat(keys);
        fn();
      }, function (err) {
        if (err) {
          if (callback) callback(err);
          return;
        }

        if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
          allKeys = allKeys.slice(queryOptions.skip, queryOptions.limit + queryOptions.skip + 1);
        }

        // docs.reverse();
        async.map(allKeys, function(doc, callback) {
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
      }
    );
  },

  findOne: function(query, queryOptions, callback) {

    this.checkConnection();

    var self = this;

    var key;

    this.scan(this.prefix + ':*',
      function (keys, fn) {
        if (!key) {
          key = keys[0];
        }
        fn();
      }, function (err) {
        if (err || !key) {
          if (callback) callback(err);
          return;
        }

        self.client.get(key, function (err, data) {
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
      }
    );
  },

  commit: function (vm, callback) {

    this.checkConnection();

    if(!vm.actionOnCommit) return callback(new Error());

    var prefixedId = this.prefix + ':' + vm.id;

    var obj;

    var self = this;

    switch(vm.actionOnCommit) {
      case 'delete':
        if (!vm.has('_hash')) {
          return callback(null);
        }

        this.client.watch(prefixedId, function (err) {
          if (err) {
            return callback(err);
          }

          self.get(vm.id, function (err, savedVm) {
            if (err) {
              return callback(err);
            }
            var currentHash = savedVm.get('_hash');
            if (currentHash && vm.has('_hash') && vm.get('_hash') !== currentHash) {
              self.client.unwatch(function (err) {
                err = new ConcurrencyError();
                if (callback) {
                  callback(err);
                }
              });
              return;
            }
            self.client.multi([['del', prefixedId]]).exec(function (err, replies) {
              if (err) {
                return callback(err);
              }
              if (!replies || replies.length === 0 || (replies[0] !== 'OK' && replies[0] !== 1)) {
                return callback(new ConcurrencyError());
              }
              callback(err);
            });
          });
        });
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
            if (currentHash && vm.has('_hash') && vm.get('_hash') !== currentHash) {
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
        this.client.watch(prefixedId, function (err) {
          if (err) {
            return callback(err);
          }

          self.get(vm.id, function (err, savedVm) {
            if (err) {
              return callback(err);
            }
            var currentHash = savedVm.get('_hash');
            if (currentHash && vm.has('_hash') && vm.get('_hash') !== currentHash) {
              self.client.unwatch(function (err) {
                err = new ConcurrencyError();
                if (callback) {
                  callback(err);
                }
              });
              return;
            }
            vm.set('_hash', uuid().toString());
            try {
              obj = JSON.stringify(vm);
            } catch (err2) {
              if (callback) callback(err2);
            }
            self.client.multi([['set', prefixedId, obj]]).exec(function (err, replies) {
              if (err) {
                return callback(err);
              }
              if (!replies || replies.length === 0 || (replies[0] !== 'OK' && replies[0] !== 1)) {
                return callback(new ConcurrencyError());
              }

              vm.actionOnCommit = 'update';
              callback(err, vm);
            });
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
    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName);
    }

    this.prefix = this.collectionName;
  },

  clear: function (callback) {
    this.checkConnection();

    if (!this.prefix) {
      if (callback) callback(null);
      return;
    }

    var self = this;

    this.client.keys(this.prefix + ':*', function(err, keys) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      async.each(keys, function (key, callback) {
        self.client.del(key, callback);
      }, function (err) {
        if (callback) callback(err);
      });
    });
  },

  clearAll: function (callback) {
    var self = this;
    async.each(collections, function (col, callback) {
      async.parallel([
        function (callback) {
          self.client.del('nextItemId:' + col, callback);
        },
        function (callback) {
          self.client.keys(col + ':*', function(err, keys) {
            if (err) {
              return callback(err);
            }
            async.each(keys, function (key, callback) {
              self.client.del(key, callback);
            }, callback);
          });
        }
      ], callback);
    }, function (err) {
      if (callback) callback(err);
    });
  }

});

module.exports = Redis;
