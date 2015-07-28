'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    cradle = Repository.use('cradle'),
    async = require('async'),
    _ = require('lodash'),
    collections = [];

function Couch (options) {
  Repository.call(this, options);

  var defaults = {
    host: 'http://localhost',
    port: 5984,
    dbName: 'context'
  };

  _.defaults(options, defaults);

  var defaultOpt = {
    cache: true,
    raw: false,
    forceSave: true//,
    // secure: true,
    // auth: { username: 'login', password: 'pwd' }
  };

  options.options = options.options || {};

  _.defaults(options.options, defaultOpt);

  this.options = options;
}

util.inherits(Couch, Repository);

_.extend(Couch.prototype, {

  connect: function (callback) {
    var self = this;

    var options = this.options;

    var client = new (cradle.Connection)(options.host, options.port, options.options);
    var db = client.database(options.dbName);
    db.exists(function (err, exists) {

      function finish() {
        self.client = client;
        self.db = db;

        db.get('_design/collection', function (err, obj) {

          var view = {
            views: {
              find: {
                map: function(doc) {
                  function split4(obj, pre) {
                    if (obj) {
                      if (Array.isArray(obj)) {
                        for (var j = 0, len = obj.length; j < len; j++) {
                          pre.collectionName = doc.collectionName;
                          emit(pre, doc);
                //          split5(obj[j], pre);
                        }
                      } else {
                        for (var i in obj) {
                         if (isNaN(i)) {
                          var item = obj[i];
                          var newI = pre ? pre + '.' + i : i;
                          var key = {};
                          key[newI] = item;
                          key.collectionName = doc.collectionName;
                          emit(key, doc);
                //          split5(item, newI);
                        }
                       }
                      }
                    }
                  }

                  function split3(obj, pre) {
                    if (obj) {
                      if (Array.isArray(obj)) {
                        for (var j = 0, len = obj.length; j < len; j++) {
                          pre.collectionName = doc.collectionName;
                          emit(pre, doc);
                          split4(obj[j], pre);
                        }
                      } else {
                        for (var i in obj) {
                         if (isNaN(i)) {
                          var item = obj[i];
                          var newI = pre ? pre + '.' + i : i;
                          var key = {};
                          key[newI] = item;
                          key.collectionName = doc.collectionName;
                          emit(key, doc);

                          split4(item, newI);
                        }
                       }
                      }
                    }
                  }

                  function split2(obj, pre) {
                    if (obj) {
                      if (Array.isArray(obj)) {
                        for (var j = 0, len = obj.length; j < len; j++) {
                          pre.collectionName = doc.collectionName;
                          emit(pre, doc);
                          split3(obj[j], pre);
                        }
                      } else {
                        for (var i in obj) {
                         if (isNaN(i)) {
                          var item = obj[i];
                          var newI = pre ? pre + '.' + i : i;
                          var key = {};
                          key[newI] = item;
                          key.collectionName = doc.collectionName;
                          emit(key, doc);

                          split3(item, newI);
                        }
                       }
                      }
                    }
                  }
                  function split(obj) {
                    if (obj) {
                      if (Array.isArray(obj)) {
                        for (var j = 0, len = obj.length; j < len; j++) {
                          emit({ collectionName: obj.collectionName }, doc);
                          split2(obj[j]);
                        }
                      } else {
                        for (var i in obj) {
                         if (isNaN(i)) {
                          if (i != '_rev' && i != '_id') {
                            var item = obj[i];
                            var key = {};
                            key[i] = item;
                            key.collectionName = doc.collectionName;
                            emit(key, doc);

                            split2(item, i);
                          }
                         }
                        }
                      }
                    }
                  }

                  var key = {};
                  key.collectionName = doc.collectionName;
                  emit(key, doc);

                  split(doc);
                }
              }
            }
          };

          if (err && err.error === 'not_found') {
            db.save('_design/collection', view, function (err) {
              if (!err) {
                self.emit('connect');
              }
              if (callback) callback(err, self);
            });
            return;
          }
          if (!err) {
            self.emit('connect');
          }
          if (callback) callback(err, self);
        });
      }

      if (err) {
        if (callback) callback(err);
        return;
      }

      if (!exists) {
        db.create(function (err) {
          if (err) {
            if (callback) callback(err);
            return;
          }
          finish();
        });
        return;
      }

      finish();
    });
  },

  disconnect: function(callback) {
    if (!this.client) {
      if (callback) callback(null);
      return;
    }

    // this.client.close();
    this.emit('disconnect');
    if (callback) callback(null);
  },

  getNewId: function(callback) {
    this.client.uuids(function(err, uuids) {
      if (err) {
        return callback(err);
      }
      callback(null, uuids[0].toString());
    });
  },

  get: function(id, callback) {

    this.checkConnection();

    var self = this;

    function getObj(ident, clb) {
      self.db.get(ident, function(err, obj) {

        if(!obj) {
          var ret = new ViewModel({ id: ident }, self);
          if (ret) {
            ret.id = ident;
            ret.set('_id', ident);
          }

          return clb(null, ret);
        }

        var vm = new ViewModel({id: ident, _id: ident}, self);
        vm.set(obj);
        vm.actionOnCommit = 'update';
        callback(null, vm);
      });
    }

    if(_.isFunction(id)) {
      callback = id;
      id = null;
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

    if (!query.key && !query.startkey && !query.endkey) {
      query.collectionName = this.collectionName;
      query = { key: query };
    } else if (query.key) {
      query.key.collectionName = this.collectionName;
    } else if (query.startkey && query.endkey) {
      query.startkey.collectionName = this.collectionName;
      query.endkey.collectionName = this.collectionName;
    }

    // if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
    //   query.limit = queryOptions.limit;
    //   query.skip = queryOptions.skip;
    // }

    this.db.view('collection/find', query, function(err, docs) {
      var res = [];

      for (var i = 0, len = docs.length; i < len; i++){
          var doc = docs[i].value;

          doc.id = doc._id;

          var found = _.find(res, function(r) {
            return r.id === doc.id;
          });

          if (!found) {
            var vm = new ViewModel(doc, self);
            vm.actionOnCommit = 'update';
            res.push(vm);
          }
      }

      if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
        res = res.slice(queryOptions.skip, queryOptions.limit + queryOptions.skip + 1);
      }

      callback(err, res);
    });

  },

  commit: function(vm, callback) {

    this.checkConnection();

    if(!vm.actionOnCommit) return callback(new Error());

    var self = this;

    switch(vm.actionOnCommit) {
      case 'delete':
        if (!vm.has('_rev')) {
          return callback(null);
        }

        var obj = vm.toJSON();
        this.db.remove(obj._id, obj._rev, function(err) {
          if (err && err.error === 'conflict' && err.reason.indexOf('update conflict') >= 0) {
            return callback(new ConcurrencyError());
          }
          callback(err, vm);
        });
        break;
      case 'create':
        // Intended Fall-through
      case 'update':
        vm.set('collectionName', this.collectionName);
        var save = function () {
          var obj = vm.toJSON();
          self.db.save(obj._id, obj._rev, obj, function(err) {
            if (err && err.error === 'conflict' && err.reason.indexOf('update conflict') >= 0) {
              return callback(new ConcurrencyError());
            }
            vm.actionOnCommit = 'update';
            callback(err, vm);
          });
        };
        if (!vm.has('_rev')) {
          this.db.get(vm.id, function(err, doc) {
            if (doc) {
              return callback(new ConcurrencyError());
            }
            save();
          });
        } else {
          save();
        }
        break;
      default:
        return callback(new Error());
    }

  },

  checkConnection: function() {
    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName)
    }
  },

  clear: function (callback) {
    this.checkConnection();

    if (!this.collectionName) {
      if (callback) callback(null);
      return;
    }

    var self = this;

    this.db.view('collection/find', { key: { collectionName: this.collectionName } }, function (err, docs) {
      if (err) {
        if (callback) callback(err);
        return;
      }

      var res = [];

      for (var i = 0, len = docs.length; i < len; i++){
        var doc = docs[i].value;

        var found = _.find(res, function(r) {
          return r.id === doc.id;
        });

        if (!found) {
          res.push(doc);
        }
      }

      async.each(res, function (d, callback) {
        self.db.remove(d._id, d._rev, callback);
      }, function (err) {
        if (callback) callback(err);
      });
    });
  },

  clearAll: function (callback) {
    var self = this;

    async.each(collections, function (col, callback) {
      self.db.view('collection/find', { key: { collectionName: col } }, function (err, docs) {
        if (err) {
          return callback(err);
        }

        var res = [];

        for (var i = 0, len = docs.length; i < len; i++){
          var doc = docs[i].value;

          var found = _.find(res, function(r) {
            return r.id === doc.id;
          });

          if (!found) {
            res.push(doc);
          }
        }

        async.each(res, function (d, callback) {
          self.db.remove(d._id, d._rev, callback);
        }, callback);
      });
    }, callback);
  }

});

module.exports = Couch;
