'use strict';

var util = require('util'),
    uuid = require('node-uuid').v4,
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    _ = require('lodash'),
    store = {};

function deepFind (obj, pattern) {
  var found;

  if (pattern) {
    var parts = pattern.split('.');
    
    found = obj;
    for (var i in parts) {
      found = found[parts[i]];
      if (_.isArray(found)) {
        found = _.filter(found, function (item) {
          var deepFound = deepFind(item, parts.slice(i + 1).join('.'));
          if (deepFound) {
            return true;
          }
          return false;
        });
        break;
      }

      if (!found) {
        break;
      }
    }
  }

  return found;
}

function InMemory(options) {
  Repository.call(this, options);
}

util.inherits(InMemory, Repository);

_.extend(Repository.prototype, {

  connect: function (callback) {
    this.emit('connect');
    if (callback) callback(null, this);
  },

  disconnect: function (callback) {
    this.emit('disconnect');
    if (callback) callback(null);
  },

  get: function(id, callback) {
    this.checkConnection();

    if (_.isFunction(id)) {
      callback = id;
      id = null;
    }

    if (!id) {
      id = uuid().toString();
    }

    var data = store[this.collectionName] ? store[this.collectionName][id] : undefined;
    if (!data) {
      return callback(null, new ViewModel({ id: id }, this));
    }

    var vm = new ViewModel(data, this);
    vm.actionOnCommit = 'update';
    callback(null, vm);
  },

  find: function(query, queryOptions, callback) {
    this.checkConnection();

    // Bind to data source
    var vms = _.values(store[this.collectionName]) || [];

    // Filter for query object
    if (!_.isEmpty(query)) {
      vms = _.filter(vms, function(vm) {
        var keys = _.keys(query);
        var values = _.values(query);
        var found = false;
        for (var i in keys) {
          var key = keys[i];
          var deepFound = deepFind(vm, key);
          if (_.isArray(deepFound) && deepFound.length > 0) {
            found = true;
          } else if (deepFound === values[i]) {
            found = true;
          } else {
            found = false;
            break;
          }
        }
        return found;
      });
    }

    if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
      vms = vms.slice(queryOptions.skip, queryOptions.limit + queryOptions.skip + 1);
    }

    var self = this;

    // Map to view models
    vms = _.map(vms, function(data) {
      var vm = new ViewModel(data, self);
      vm.actionOnCommit = 'update';
      return vm;
    });

    callback(null, vms);
  },

  commit: function(vm, callback) {
    this.checkConnection();

    var col = store[this.collectionName];
    if (!col) {
      col = {};
      store[this.collectionName] = col;
    }

    if(!vm.actionOnCommit) return callback(new Error());

    switch(vm.actionOnCommit) {
      case 'delete':
        delete col[vm.id];
        return callback(null, vm);
      case 'create':
        if (col[vm.id]) {
          return callback(new ConcurrencyError());
        }
        // Intended Fall-through
      case 'update':
        if (col[vm.id] && vm.has('_hash') && col[vm.id]._hash && vm.get('_hash') !== col[vm.id]._hash) {
          return callback(new ConcurrencyError());
        }
        vm.actionOnCommit = 'update';
        vm.set('_hash', uuid().toString());
        var obj = vm.toJSON();
        col[obj.id] = obj;
        return callback(null, vm);
      default:
        return callback(new Error());
    }
  }

});

module.exports = Repository;
