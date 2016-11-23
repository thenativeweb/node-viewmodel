'use strict';

var util = require('util'),
  Repository = require('../base'),
  ViewModel = Repository.ViewModel,
  ConcurrencyError = require('../concurrencyError'),
  elasticsearch = Repository.use('elasticsearch'),
  uuid = require('uuid').v4,
  jsondate = require('jsondate'),
  _ = require('lodash'),
  async = require('async'),
  collections = [];

function Elasticsearch (options) {
  Repository.call(this, options);

  var defaults = {
    index: 'context',
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

function getTerms (query) {
  return _(query).keys().filter(function (k) {
    return _.isString(query[k]) || _.isNumber(query[k]) || _.isDate(query[k]) || _.isBoolean(query[k]);
  }).map(function (k) {
    var term = {};
    term[k] = query[k];
    return { term: term };
  }).value();
}

function getInTerms (query) {
  return _(query).keys().filter(function (k) {
    return _.isPlainObject(query[k]) && query[k].$in;
  }).map(function (k) {
    var term = {};
    term[k] = query[k].$in;
    return { term: term };
  }).value();
}

function getRegexTerms (query) {
  return _(query).keys().filter(function (k) {
    return _.isPlainObject(query[k]) && query[k].$regex;
  }).map(function (k) {
    var regexp = {};
    regexp[k] = query[k].$regex;
    return { regexp: regexp };
  }).value();
}

function getRanges (query) {
  return _(query).keys().filter(function (k) {
    if (_.isPlainObject(query[k])) {
      return query[k].$gt || query[k].$gte || query[k].$lt || query[k].$lte;
    }
    return false;
  }).map(function (k) {
    var range = {};
    range[k] = {};
    _.each(_.keys(query[k]), function (sub) {
      range[k][sub.substr(1)] = query[k][sub];
    });
    return { range: range };
  }).value();
}

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
        id: id
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

      var body = {
        from: queryOptions.skip || 0,
        size: (!queryOptions.limit || queryOptions.limit > 2147483647) ? 2147483647 : queryOptions.limit
      };

      if (queryOptions.native) {
        body = query;
      } else {

        if (_.isEmpty(query)) {
          body.query = {
            match_all: {}
          };
        } else {

          if (queryOptions.sort) {
            body.sort = [];

            var keys, values;
            if (_.isArray(queryOptions.sort)) {
              _.each(queryOptions.sort, function (pair) {
                var s = {};
                s[pair[0]] = pair[1];
                body.sort.push(s);
              });
            } else {
              keys = _.keys(queryOptions.sort);
              values = _.map(_.values(queryOptions.sort), function (v) {
                return v === 1 ? 'asc' : 'desc';
              });
              for (var i = 0, len = keys.length; i < len; i++) {
                var s = {};
                s[keys[i]] = values[i];
                body.sort.push(s);
              }
            }
          }

          body.query = { filtered: { filter: { } } };

          if (query.$or) {
            _.each(query.$or, function (ele) {
              var orTerms = getTerms(ele);

              if (orTerms.length > 0) {
                body.query.filtered.filter.or = body.query.filtered.filter.or || [];
                body.query.filtered.filter.or = body.query.filtered.filter.or.concat(orTerms);
              }

              var orInTerms = getInTerms(ele);

              if (orInTerms.length > 0) {
                body.query.filtered.filter.or = body.query.filtered.filter.or || [];
                body.query.filtered.filter.or = body.query.filtered.filter.or.concat(orInTerms);
              }

              var orRanges = getRanges(ele);

              if (orRanges.length > 0) {
                body.query.filtered.filter.or = body.query.filtered.filter.or || [];
                body.query.filtered.filter.or = body.query.filtered.filter.or.concat(orRanges);
              }

              var orRegexTerms = getRegexTerms(ele);

              if (orRegexTerms.length > 0) {
                body.query.filtered.filter.or = body.query.filtered.filter.or || [];
                body.query.filtered.filter.or = body.query.filtered.filter.or.concat(orRegexTerms);
              }
            });
          }

          if (query.$and) {
            _.each(query.$and, function (ele) {
              var andTerms = getTerms(ele);

              if (andTerms.length > 0) {
                body.query.filtered.filter.and = body.query.filtered.filter.and || [];
                body.query.filtered.filter.and = body.query.filtered.filter.and.concat(andTerms);
              }

              var andInTerms = getInTerms(ele);

              if (andInTerms.length > 0) {
                body.query.filtered.filter.and = body.query.filtered.filter.and || [];
                body.query.filtered.filter.and = body.query.filtered.filter.and.concat(andInTerms);
              }

              var andRanges = getRanges(ele);

              if (andRanges.length > 0) {
                body.query.filtered.filter.and = body.query.filtered.filter.and || [];
                body.query.filtered.filter.and = body.query.filtered.filter.and.concat(andRanges);
              }

              var andRegexTerms = getRegexTerms(ele);

              if (andRegexTerms.length > 0) {
                body.query.filtered.filter.and = body.query.filtered.filter.and || [];
                body.query.filtered.filter.and = body.query.filtered.filter.and.concat(andRegexTerms);
              }
            });
          } else {
            var terms = getTerms(query);

            if (terms.length > 0) {
              body.query.filtered.filter.and = body.query.filtered.filter.and || [];
              body.query.filtered.filter.and = body.query.filtered.filter.and.concat(terms);
            }

            var inTerms = getInTerms(query);

            if (inTerms.length > 0) {
              body.query.filtered.filter.and = body.query.filtered.filter.and || [];
              body.query.filtered.filter.and = body.query.filtered.filter.and.concat(inTerms);
            }

            var ranges = getRanges(query);

            if (ranges.length > 0) {
              body.query.filtered.filter.and = body.query.filtered.filter.and || [];
              body.query.filtered.filter.and = body.query.filtered.filter.and.concat(ranges);
            }

            var regexTerms = getRegexTerms(query);

            if (regexTerms.length > 0) {
              body.query.filtered.filter.and = body.query.filtered.filter.and || [];
              body.query.filtered.filter.and = body.query.filtered.filter.and.concat(regexTerms);
            }
          }

          if (!body.query.filtered.filter.and && !body.query.filtered.filter.or) {
            body.query = {
              match_all: {}
            };
          }
        }
      }

      self.client.search({
        index: self.index,
        type: self.collectionName,
        body: body
      }, function (err, res) {
        if (err) {
          return callback(err);
        }

        // Map to view models
        var vms = _.map(res.hits.hits, function(res) {
          var data = jsondate.parse(JSON.stringify(res._source));
          var vm = new ViewModel(data, self);
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

    function insert () {
      vm.set('_version', 1);
      obj = vm.toJSON();

      self.client.create({
        index: self.index,
        type: self.collectionName,
        id: vm.id,
        refresh: true,
        body: obj
      }, function (err, res) {
        if (err && (err.message.toLowerCase().indexOf('version') >= 0 || err.message.toLowerCase().indexOf('already') >= 0)) {
          return callback(new ConcurrencyError());
        }
        vm.actionOnCommit = 'update';
        callback(err, vm);
      });
    }

    this.checkConnection(function (err) {
      if (err) {
        return callback(err);
      }

      switch(vm.actionOnCommit) {
        case 'delete':
          if (!vm.has('_version')) {
            return callback(null);
          }
          self.client.delete({
            index: self.index,
            type: self.collectionName,
            refresh: true,
            version: vm.get('_version'),
            id: vm.id
          }, function (err, res) {
            if (err && (err.message.toLowerCase().indexOf('version') >= 0 || err.message.toLowerCase().indexOf('not found') >= 0)) {
              return callback(new ConcurrencyError());
            }
            if (callback) callback(err);
          });
          break;
        case 'create':
          insert();
          break;
        case 'update':
          if (!vm.has('_version')) {
            insert();
            return;
          }

          var nextVersion = vm.get('_version') + 1;
          vm.set('_version', nextVersion);
          obj = vm.toJSON();
          self.client.index({
            index: self.index,
            type: self.collectionName,
            id: vm.id,
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
