var util = require('util'),
    _ = require('lodash'),
    async = require('async'),
    ConcurrencyError = require('../concurrencyError'),
    gcFirestore = require('@google-cloud/firestore'),
    Repository = require('../base'),
    uuid = require('uuid').v4,
    ViewModel = Repository.ViewModel;

var collections = [];

function Firestore(options) {
  Repository.call(this);
  this.options = _.merge({ timestampsInSnapshots: true }, options);
}

util.inherits(Firestore, Repository);

function implementError (callback) {
  var err = new Error('Storage method add is not implemented');
  if (callback) callback(err);
  throw err;
}

function parseFirestoreQuery(query) {
  if (_.isArray(query)) {
    return query;
  } else if (_.isPlainObject(query)) {
    return _.map(query, function(value, key) {
      return [key, '==', value];
    });
  }
  throw new Error('Unknown query type');
};

function firestoreQueryParser(collectionRef, queryParams) {
  var params = parseFirestoreQuery(queryParams);
  return _.reduce(params, function(acc, q) {
    return acc.where.apply(acc, q);
  }, collectionRef);
};

function emptyCollection(db, collection, callback) {
  var collectionRef = db.collection(collection);
  var query = collectionRef.get().then(function (querySnapshot) {
    var writeBatch = db.batch();
    querySnapshot.forEach(function (documentSnapshot) {
      var documentPath = collection + '/' + documentSnapshot.id;
      var documentRef = db.doc(documentPath);
      writeBatch.delete(documentRef);
    });
    writeBatch.commit().then(function () {
      if (callback) callback(null);
    });
  });
};

function getPrecondition(vm) {
  var precondition = {};
  if (!_.isUndefined(vm.get('_updateTime'))) {
    const time = vm.get('_updateTime');
    if (_.isDate(time)) {
      precondition['lastUpdateTime'] = time.toISOString();
    } else if (_.isString(time)) {
      precondition['lastUpdateTime'] = time;
    }
  }
  return precondition;
}

function enrichVMWithTimestamps(vm, documentSnapshot) {
  _.isUndefined(documentSnapshot.readTime) ? false : vm.set('_readTime', documentSnapshot.readTime);
  _.isUndefined(documentSnapshot.createTime) ? false : vm.set('_createTime', documentSnapshot.createTime);
  _.isUndefined(documentSnapshot.updateTime) ? false : vm.set('_updateTime', documentSnapshot.updateTime);
  return vm;
};

function applyQueryOptions(query, options) {
  if (!_.isUndefined(options)) {
    // Apply supported queryOptions
    if (_.has(options, 'limit')) {
      query = query.limit(options.limit);
    }
    if (_.has(options, 'skip')) {
      query = query.offset(options.skip);
    }
    if (_.has(options, 'sort')) {
      var sortKey = options.sort.keys[0];
      var direction = options.sort.keys[sortKey] == 1 ? 'asc' : 'desc';
      query = query.orderBy(sortKey, direction);
    }
  }
  return query;
}

_.extend(Firestore.prototype, {

  connect: function (callback) {
    var self = this;
    var options = this.options;
    self.db = new gcFirestore(options);
    self.emit('connect');
    if (callback) callback(null, self);
  },

  disconnect: function (callback) {
    var self = this;
    delete self.db;
    self.emit('disconnect');
    if (callback) callback(null, self);
  },

  getNewId: function (callback) {
    this.checkConnection();

    var id = uuid().toString();
    if (callback) callback(null, id);
  },

  get: function (id, callback) {
    this.checkConnection();

    if(_.isFunction(id)) {
      callback = id;
      id = null;
    }

    if (!id) {
      id = uuid().toString();
    }

    var self = this;

    var documentPath = this.collection + '/' + id;
    var documentRef = this.db.doc(documentPath);

    documentRef.get().then(function (documentSnapshot) {
      var vm = new ViewModel(documentSnapshot.data() || { id }, self);
      vm = enrichVMWithTimestamps(vm, documentSnapshot);
      if (documentSnapshot.exists) {
        vm.actionOnCommit = 'update';
      } else {
        vm.actionOnCommit = 'create';
      }
      callback(null, vm);
    });
  },

  find: function (queryParams, queryOptions, callback) {
    this.checkConnection();

    var self = this;
    var collectionRef = this.db.collection(this.collection);

    var query = firestoreQueryParser(collectionRef, queryParams);
    query = applyQueryOptions(query, queryOptions);

    query.get().then(function (querySnapshot) {
      var vms = _.map(querySnapshot.docs, function(documentSnapshot) {
        var vm = new ViewModel(documentSnapshot.data(), self);
        vm = enrichVMWithTimestamps(vm, documentSnapshot);
        vm.actionOnCommit = 'update';
        return vm;
      });
      callback(null, vms);
    });
  },

  findOne: function (queryParams, queryOptions, callback) {
    // NOTE: queryOptions is ignored
    this.checkConnection();

    var self = this;
    var collectionRef = this.db.collection(this.collection);

    var query = firestoreQueryParser(collectionRef, queryParams);
    _.unset(queryOptions, 'limit');
    query = applyQueryOptions(query, queryOptions);
    query.limit(1).get().then(function (querySnapshot) {
      if (querySnapshot.size == 0) {
        callback(null, null);
      }
      querySnapshot.forEach(function (documentSnapshot) {
        var vm = new ViewModel(documentSnapshot.data(), self);
        vm = enrichVMWithTimestamps(vm, documentSnapshot);
        vm.actionOnCommit = 'update';
        callback(null, vm);
      });
    });
  },

    commit: function (vm, callback) {
      this.checkConnection();

      if (!vm.actionOnCommit) return callback(new Error('actionOnCommit is not defined!'));

      var self = this;

      switch(vm.actionOnCommit) {
      case 'delete':
        var documentPath = this.collection + '/' + vm.id;
        var documentRef = this.db.doc(documentPath);
        var precondition = getPrecondition(vm);
        documentRef.delete(precondition).then(function () {
          callback(null);
        }).catch(function (err) {
            return callback(new ConcurrencyError());
        });
        break;
      case 'create':
        var documentPath = this.collection + '/' + vm.id;
        var documentRef = this.db.doc(documentPath);
        documentRef.get().then(function (documentSnapshot) {
          if (documentSnapshot.exists) {
            return callback(new ConcurrencyError());
          }
          documentRef.set(vm.attributes).then(function () {
            vm.actionOnCommit = 'update';
            callback(null, vm);
          });
        });
        break;
      case 'update':
        var documentPath = this.collection + '/' + vm.id;
        var documentRef = this.db.doc(documentPath);
        documentRef.get().then(function (documentSnapshot) {
          if (!documentSnapshot.exists) {
            documentRef.set(vm.attributes).then(function () {
              vm.actionOnCommit = 'update';
              callback(null, vm);
            });
          } else {
            if (!_.isUndefined(documentSnapshot.updateTime) &&
                 _.isUndefined(vm.get('_updateTime'))) {
              return callback(new ConcurrencyError());
            }

            var precondition = getPrecondition(vm);
            documentRef.update(vm.attributes, precondition).then(function () {
              self.get(vm.id, callback);
            }, function (err) {
              return callback(new ConcurrencyError());
            });
          }
        });
        break;
      default:
        return callback(new Error('Unknown actionOnCommit: ' + vm.actionOnCommit));
      };
  },

  checkConnection: function (callback) {
    if (this.collection) {
      return;
    }

    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName)
    }

    this.collection = this.collectionName;
    if (callback) callback(null);
  },

  clear: function (callback) {
    this.checkConnection();

    var self = this;
    if (!this.collection) {
      if (callback) callback(null);
      return;
    }

    emptyCollection(this.db, this.collection, callback);
  },

  clearAll: function (callback) {
    var self = this;
    async.each(collections, function (col, callback) {
      emptyCollection(self.db, col, callback);
    }, callback);
  },

});

module.exports = Firestore;
