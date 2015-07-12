'use strict';

var util = require('util'),
  Repository = require('../base'),
  ViewModel = Repository.ViewModel,
  ConcurrencyError = require('../concurrencyError'),
  elasticsearch = require('elasticsearch'),
  uuid = require('node-uuid').v4,
  jsondate = require('jsondate'),
  _ = require('lodash'),
  async = require('async'),
  collections = [];

function Elasticsearch (options) {
  Repository.call(this, options);

  var defaults = {
    index: 'context',
    prefix: '',
    ttl: 60 * 60 * 24 * 14, // 14 days
    pingInterval: 1000
  };

  _.defaults(options, defaults);

  if (!options.hosts && !options.host) {
    options.host = 'localhost:9200';
  }

  this.options = options;

  this.index = this.options.index;
}

util.inherits(Elasticsearch, Repository);

_.extend(Elasticsearch.prototype, {

  connect: function (callback) {
    var self = this;

    this.isConnected = false;

    this.client = new elasticsearch.Client(this.options);

    var callbacked = false;
    this.closeCalled = false;

    var interval = setInterval(function () {
      if (self.closeCalled) {
        clearInterval(interval);
      }

      self.client.ping(function (err) {
        if (err) {
          if (self.isConnected) {
            self.isConnected = false;
            self.emit('disconnect');
          }
          if (callback && !callbacked) {
            callbacked = true;
            callback(err, self);
          }
          return;
        }

        if (!self.isConnected && !callbacked) {
          self.isConnected = true;
          self.emit('connect');
          if (callback) {
            callbacked = true;
            callback(err, self);
          }
        }
      });
    }, this.options.pingInterval);
  },

  disconnect: function (callback) {
    this.closeCalled = true;
    if (this.client) this.client.close();
    if (callback) callback(null);
  },

  getNewId: function (callback) {
    var id = uuid().toString();
    if (callback) callback(null, id);
  },

  get: function(id, callback) {

    if (_.isFunction(id)) {
      callback = id;
      id = null;
    }

    if (!id) {
      id = uuid().toString();
    }

    var self = this;

    this.checkConnection(function (err) {
      if (err) {
        return callback(err);
      }

      self.client.get({
        index: self.index,
        type: self.collectionName,
        id: self.options.prefix + id
      }, function (err, res) {
        if (err && err.message.toLowerCase().indexOf('not found') >= 0) {
          err = null;
        }
        if (err) return callback(err);

        if (res && res._source) {
          var data = jsondate.parse(JSON.stringify(res._source));
          var vm = new ViewModel(data, self);
          vm.actionOnCommit = 'update';
          return callback(null, vm);
        }

        callback(null, new ViewModel({ id: id }, self));
      });
    });
  },

  find: function(query, queryOptions, callback) {

    var self = this;

    this.checkConnection(function (err) {
      if (err) {
        return callback(err);
      }

      self.client.search({
        index: self.index,
        type: self.collectionName,
        body: {
          from: 0,
          size: 2147483647,
          query: {
            match_all: {}
          }
        }
      }, function (err, res) {
        if (err) {
          return callback(err);
        }

        // Map to view models
        var vms = _.map(res.hits.hits, function(data) {
          var vm = new ViewModel(data._source, self);
          vm.actionOnCommit = 'update';
          return vm;
        });

        callback(err, vms);
      });
    });

  },

  findOne: function(query, queryOptions, callback) {

    queryOptions.limit = 1;

    this.find(query, queryOptions, function (err, vms) {
      if (err) {
        return callback(err);
      }

      if (vms.length === 0) {
        return callback(null, null);
      }
      callback(null, vms[0]);
    });

  },

  commit: function(vm, callback) {

    if (!vm.actionOnCommit) return callback(new Error());

    var obj;

    var self = this;

    this.checkConnection(function (err) {
      if (err) {
        return callback(err);
      }

      switch(vm.actionOnCommit) {
        case 'delete':
          self.client.delete({
            index: self.index,
            type: self.collectionName,
            refresh: true,
            id: self.options.prefix + vm.id
          }, function (err, res) {
            if (err && err.message.toLowerCase().indexOf('not found') >= 0) {
              err = null;
            }
            if (callback) callback(err);
          });
          break;
        case 'create':

          vm.set('_version', 1);
          obj = vm.toJSON();

          self.client.create({
            index: self.index,
            type: self.collectionName,
            id: self.options.prefix + vm.id,
            refresh: true,
            body: obj
          }, function (err, res) {
            if (err && (err.message.toLowerCase().indexOf('version') >= 0 || err.message.toLowerCase().indexOf('already') >= 0)) {
              return callback(new ConcurrencyError());
            }
            vm.actionOnCommit = 'update';
            callback(err, vm);
          });
          break;
        case 'update':
          var nextVersion = vm.get('_version') + 1;
          vm.set('_version', nextVersion);
          obj = vm.toJSON();
          self.client.index({
            index: self.index,
            type: self.collectionName,
            id: self.options.prefix + vm.id,
            version: nextVersion - 1,
            refresh: true,
            body: obj
          }, function (err, res) {
            if (err && (err.message.toLowerCase().indexOf('version') >= 0 || err.message.toLowerCase().indexOf('already') >= 0)) {
              return callback(new ConcurrencyError());
            }
            vm.actionOnCommit = 'update';
            callback(err, vm);
          });
          break;
        default:
          return callback(new Error());
      }
    });
  },

  checkConnection: function (callback) {
    if (this.isInited) {
      return callback(null);
    }

    if (!this.collectionName) {
      return callback(null);
    }

    this.isInited = true;

    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName)
    }

    var self = this;

    this.client.indices.create({
      index: this.index,
      type: this.collectionName,
      refresh: true
    }, function(err) {
      if (err && err.message.toLowerCase().indexOf('already') >= 0) {
        err = null;
      }
      if (err) {
        return callback(err);
      }

      self.client.indices.putMapping({
        index: self.index,
        type: self.collectionName,
        refresh: true,
        body: {
          dynamic_templates: [
            {
              non_analyzed_string: {
                match: '*',
                match_mapping_type: 'string',
                'mapping': {
                  'type': 'string',
                  'index': 'not_analyzed'
                }
              }
            }
          ]
        }
      }, callback);
    });
  },

  clear: function (callback) {
    if (!this.collectionName) {
      if (callback) callback(null);
      return;
    }

    var self = this;

    this.checkConnection(function (err) {
      if (err) {
        if (callback) callback(err);
        return;
      }

      self.client.deleteByQuery({
        index: self.index,
        type: self.collectionName,
        refresh: true,
        body: {
          query: {
            bool: {
              must: [
                {
                  match_all: {}
                }
              ]
            }
          }
        }
      }, callback || function () {});
    });
  },

  clearAll: function (callback) {
    var self = this;
    async.each(collections, function (col, callback) {
      self.client.deleteByQuery({
        index: self.index,
        type: col,
        refresh: true,
        body: {
          query: {
            bool: {
              must: [
                {
                  match_all: {}
                }
              ]
            }
          }
        }
      }, callback);
    }, callback || function () {});
  }

});

module.exports = Elasticsearch;
