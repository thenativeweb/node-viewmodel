'use strict';

var util = require('util'),
    uuid = require('node-uuid').v4,
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    _ = require('lodash'),
    sift = require('sift'),
    store = {},
    collections = [];

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
      vms = sift(query, vms);
    }

    var self = this;

    if (queryOptions.sort) {
      var keys, values;
      if (_.isArray(queryOptions.sort)) {
        keys = [];
        values = [];
        _.each(queryOptions.sort, function (pair) {
          keys.push(pair[0]);
          values.push(pair[1]);
        });
        vms = _.sortByOrder(vms, keys, values);
      } else {
        keys = _.keys(queryOptions.sort);
        values = _.map(_.values(queryOptions.sort), function (v) {
          return v === 1;
        });
        vms = _.sortByOrder(vms, keys, values);
      }
    }

    if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
      vms = vms.slice(queryOptions.skip, queryOptions.limit + 1);
    }

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
        if (col[vm.id] && vm.has('_hash') && col[vm.id]._hash && vm.get('_hash') !== col[vm.id]._hash) {
          return callback(new ConcurrencyError());
        }
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
  },

  checkConnection: function() {
    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName);
    }
  },

  clear: function (callback) {
    this.checkConnection();

    if (store[this.collectionName]) {
      store[this.collectionName] = {};
    }
    if (callback) callback(null);
  },

  clearAll: function (callback) {
    store = {};
    collections.forEach(function (col) {
      if (store[col]) {
        delete store[col];
      }
    });
    if (callback) callback(null);
  }

});

module.exports = Repository;
