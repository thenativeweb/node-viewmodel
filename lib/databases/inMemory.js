'use strict';

var util = require('util'),
    uuid = require('node-uuid').v4,
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    _ = require('lodash');

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

Repository.store = {};

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

    var data = Repository.store[this.collectionName] ? Repository.store[this.collectionName][id] : undefined;
    if (!data) {
      return callback(null, new ViewModel({ id: id }, this));
    }

    var vm = new ViewModel(data, this);
    vm.actionOnCommit = 'update';
    callback(null, vm);
  },

  find: function(query, callback) {
    this.checkConnection();

    callback = callback || query;

    // Bind to data source
    var vms = Repository.store[this.collectionName];

    // Filter for query object
    if(arguments.length === 2) {
      vms = _.filter(vms, function(vm) {
        var deepFound = deepFind(vm, _.keys(query)[0]);
        if (_.isArray(deepFound) && deepFound.length > 0) {
          return true;
        } else if (deepFound === _.values(query)[0]) {
          return true;
        }
        return false;
      });
    }

    var self = this;

    // Map to view models
    vms = _.map(vms, function(data) {
      var vm = new ViewModel(data, this);
      vm.actionOnCommit = 'update';
      return vm;
    });

    callback(null, vms);
  },

  commit: function(vm, callback) {
    this.checkConnection();

    var col = Repository.store[this.collectionName];
    if (!col) {
      col = {};
      Repository.store[this.collectionName] = col;
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
