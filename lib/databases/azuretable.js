'use strict';

var util = require('util'),
  Repository = require('../base'),
  dotty = require('dotty'),
  ViewModel = Repository.ViewModel,
  ConcurrencyError = require('../concurrencyError'),
  azure = require('azure-storage'),
  async = require('async'),
  uuid = require('node-uuid').v4,
  _ = require('lodash'),
  eg = azure.TableUtilities.entityGenerator,
  collections = [];

//helpers
var generateEntity = function (obj) {
  var entity = _.clone(obj);
  for (var property in entity) {
    if (property !== '_metadata') {
      if (_.isArray(entity[property])) {
        entity[property] = JSON.stringify(entity[property]);
      }
      if (_.isObject(entity[property])) {
        entity[property] = JSON.stringify(entity[property]);
      }
      switch (typeof entity[property]) {
        case 'string':
          entity[property] = eg.String(entity[property]);
          break;
        case 'boolean':
          entity[property] = eg.Boolean(entity[property]);
          break;
        case 'number':
          entity[property] = eg.Int32(entity[property]);
          break;
        default:
          entity[property] = eg.Entity(entity[property]);
      }
    }
  }
  return entity;
};

var generateObject = function (entity) {
  var obj = _.clone(entity);

  obj = _.omit(obj, 'Timestamp','PartitionKey', 'RowKey', '.metadata');

  var IsJsonString = function IsJsonString(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  };

  for (var property in obj) {
    if (property !== '.metadata') {
      if (IsJsonString(obj[property]['_'])) {
        obj[property]['_'] = JSON.parse(obj[property]['_']);
        if (!_.isArray(obj[property]['_'])
          && !_.isObject(obj[property]['_'])
          && obj[property]['$']
          && obj[property]['$'] == 'Edm.String') {
          obj[property]['_'] = obj[property]['_'].toString();
        }
      }
      obj[property] = obj[property]['_'];
    }
  }
  return obj;
};

var propertyResolver = function (pk, rk, name, value) {
  if (name.indexOf('BinaryField') !== -1) {
    return 'Edm.Binary';
  } else if (name.indexOf('GuidField') !== -1) {
    return 'Edm.Guid';
  } else if (name.indexOf('DateField') !== -1) {
    return 'Edm.DateTime';
  } else if (name.indexOf('DoubleField') !== -1) {
    return 'Edm.Double';
  }
  return 'Edm.String';
};


// Class
function AzureTable(options) {
  Repository.call(this, options);

  options = options || {};

  var azureConf = {
    storageAccount: 'nodeeventstore',
    storageAccessKey: 'aXJaod96t980AbNwG9Vh6T3ewPQnvMWAn289Wft9RTv+heXQBxLsY3Z4w66CI7NN12+1HUnHM8S3sUbcI5zctg==',
    storageTableHost: 'https://nodeeventstore.table.core.windows.net/'
  };

  this.options = _.defaults(options, azureConf);
}

util.inherits(AzureTable, Repository);

_.extend(AzureTable.prototype, {

  connect: function (callback) {

    var retryOperations = new azure.ExponentialRetryPolicyFilter();

    var self = this;

    this.client = azure.createTableService(this.options.storageAccount, this.options.storageAccessKey, this.options.storageTableHost).withFilter(retryOperations);

    self.emit('connect');
    return callback(null, self);

  },

  disconnect: function (callback) {
    this.emit('disconnect');
    if (callback) callback(null);
  },

  get: function (id, callback) {

    var self = this;
    var options = {};

    if (_.isFunction(id)) {
      callback = id;
      id = null;
    }

    if (!id) {
      id = uuid().toString();
    }

    options.autoResolveProperties = true;
    //options.entityResolver = generateObject;

    self.checkConnection(function (err) {

      if (err) {
        if (callback) return callback(err);
      }

      self.client.retrieveEntity(self.collectionName,
        id,
        id,
        options,
        function (err, entity) {
          if (err && err.code != 'ResourceNotFound') {
            if (callback) return callback(err);
          }

          if (!entity) {
            return callback(null, new ViewModel({ id: id }, self));
          }

          entity = generateObject(entity);
          var vm = new ViewModel(entity, self);
          vm.actionOnCommit = 'update';
          callback(null, vm);
        });
    });
  },

  find: function (query, queryOptions, callback) {

    var self = this;

    var options = {
      autoResolveProperties: true,
      entityResolver: generateObject
    };

    var tableQuery = new azure.TableQuery();
    var pageSize = queryOptions.skip + queryOptions.limit;

    tableQuery = _(query)
      .reduce(function (result, val, key) {
        if (key.indexOf('.') == -1) {
          if (result._where.length === 0) return tableQuery.where(key + ' eq ?', val);
          return result.and(key + ' eq ?', val)
        } else {
          return result;
        }
      }, tableQuery);

    if (queryOptions.limit !== -1) {
      tableQuery = tableQuery.top(pageSize);
    }

    self.checkConnection(function (err) {

      if (err) {
        if (callback) return callback(err);
      }

      var entities = [];
      var continuationToken = queryOptions.continuationToken;

      async.doWhilst(function (end) {
        // retrieve entities
        self.client.queryEntities(self.collectionName, tableQuery, continuationToken, options, function (err, results) {
          if (err) {
            return end(err);
          }

          continuationToken = results.continuationToken;

          entities = entities.concat(results.entries);

          end(null);
        });
      }, function () {
        // test if we need to load more
        return entities.length < pageSize ? continuationToken !== null : false;
      }, function (err) {

        // return results
        if (err) {
          if (callback) return callback(err);
        }
        if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
          if (queryOptions.limit === -1) {
            entities = entities.slice(queryOptions.skip);
          } else {
            entities = entities.slice(queryOptions.skip, pageSize);
          }
        }

        var vms = _.map(entities, function (data) {
          var vm = new ViewModel(data, self);
          vm.actionOnCommit = 'update';
          return vm;
        });

        if (callback) callback(null, vms);
      });
    });
  },

  commit: function (vm, callback) {

    var self = this;

    self.checkConnection(function (err) {

      if (!vm.actionOnCommit) return callback(new Error());

      var objDescriptor = {
        PartitionKey: eg.String(vm.id),
        RowKey: eg.String(vm.id)
      };


      switch (vm.actionOnCommit) {
        case 'delete':

          self.client.deleteEntity(self.collectionName, objDescriptor, function (err) {
            if (err) {
              if (callback) callback(err);
            } else {
              if (callback) callback(null);
            }
          });

          break;

        case 'create':

          var obj;
          obj = vm.toJSON();
          obj = generateEntity(obj);
          obj = _.assign(obj, objDescriptor);

          self.client.insertEntity(self.collectionName, obj, function (err) {
            if (err) {
              if (err.code == 'EntityAlreadyExists') err = new ConcurrencyError();
              if (callback) callback(err);
            } else {
              vm.actionOnCommit = 'update';
              if (callback) callback(null, vm);
            }
          });
          break;

        case 'update':

          var obj;
          obj = vm.toJSON();
          obj = generateEntity(obj);
          obj = _.assign(obj, objDescriptor);

          self.client.insertOrReplaceEntity(self.collectionName, obj, function (err) {
            if (err) {
              if (err.code == 'ConditionNotMet' && err.statusCode == 412) err = new ConcurrencyError();
              if (callback) callback(err);
            } else {
              vm.actionOnCommit = 'update';
              if (callback) callback(null, vm);
            }
          });
          break;

        default:
          return callback(new Error());
      }
    });
  },

  checkConnection: function (callback) {
    var self= this;
    this.client.createTableIfNotExists(this.collectionName, function (err) {
      if (err) {
        if (callback) callback(err, null);
      }
      else {

        if (collections.indexOf(self.collectionName) < 0) {
          collections.push(self.collectionName);
        }

        if (callback) callback(null, self);
      }
    });
  },

  clear: function (callback) {
    var self = this;
    var query = new azure.TableQuery();

    async.each(collections, function (col, callback) {

      self.client.queryEntities(col, query, null, function (err, entities) {
          if (!err) {
            async.each(entities.entries, function (entity, callback) {
                self.client.deleteEntity(col, entity, function (error, response) {
                  callback(error);
                });
              },
              function (error) {
                callback(error);
              });
          }
        }
      );
    }, callback);
  }

});

module.exports = AzureTable;
