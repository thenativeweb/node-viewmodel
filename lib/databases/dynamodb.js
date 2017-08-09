'use strict';

var util = require('util'),
  Repository = require('../base'),
  ViewModel = Repository.ViewModel,
  ConcurrencyError = require('../concurrencyError'),
  async = require('async'),
  uuid = require('uuid').v4,
  aws = require('aws-sdk'),
  _ = require('lodash'),
  collections = [];

aws.config.update({ region: 'ap-southeast-2' });

function DynamoDB(options) {
  options = options || {
    hashKeyField: 'id',
    rangeKeyField: 'rangeKey'
  };

  var awsConf = {
    region: 'ap-southeast-2',
    endpointConf: {}
  };

  /* istanbul ignore next */
  if (process.env['AWS_DYNAMODB_ENDPOINT']) {
    awsConf.endpointConf = { endpoint: process.env['AWS_DYNAMODB_ENDPOINT'] };
  }

  this.options = _.defaults(options, awsConf);

  var defaults = {
    lockTableName: 'aggregatelock',
    ReadCapacityUnits: 1,
    WriteCapacityUnits: 3
  };

  this.options = _.defaults(this.options, defaults);
}

util.inherits(DynamoDB, Repository);

_.extend(DynamoDB.prototype, {
  connect: function(callback) {
    var self = this;
    self.client = new aws.DynamoDB(self.options.endpointConf);
    self.documentClient = new aws.DynamoDB.DocumentClient(self.client);
    self.isConnected = true;
    self.emit('connect');
    /* istanbul ignore else */
    if (callback) callback(null, self);
  },

  disconnect: function(callback) {
    this.emit('disconnect');
    /* istanbul ignore else */
    if (callback) callback(null);
  },

  get: function(id, callback) {
    var self = this, 
      options = {},
      _callback = callback, _id = id;

    if (_.isFunction(id)) {
      _callback = id;
      _id = null;
    } 

    if (!_id) {
      _id = uuid().toString();
    }
    self.checkConnection(function(err) {
      if (err) {
        return _callback(err);
      }

      const params = {
        TableName: self.collectionName,
        Key: {
          HashKey: _id,
          RangeKey: _id
        }
      };

      self.documentClient.get(params, function(err, data) {
        if (err) {
          _callback(err)
        } else {
          if (!data || !data.Item) {
            return _callback(null, new ViewModel({ id: _id }, self))  ;
          }
          var vm = new ViewModel(data.Item, self);
          vm.actionOnCommit = 'update';
          _callback(null, vm);
        }
      });
    });
  },
  find: function(query, queryOptions, callback) {
    var self = this;
    var _query = query, _queryOptions = queryOptions, _callback = callback;

    if (_.isFunction(query)) {
      _callback = query;
      _query = {};
      _queryOptions = {};
    } else if (_.isFunction(queryOptions)) {
      _callback = queryOptions;
      _query = query;
      _queryOptions = {};
    } 

    self.checkConnection(function(err) {
      if (err) {
        return _callback(err);
      }
      queryOptions = _.defaults(_queryOptions, {skip: 0, limit: -1});
      var params = queryToScanParams(self.collectionName, _query, _queryOptions);
      self.documentClient.scan(params, function(err, data) {
        if (err) _callback(err);
        var entities = _.get(data, 'Items', []);
        if (_queryOptions.skip !== undefined && _queryOptions.limit !== undefined) {
          if (_queryOptions.limit === -1) {
            entities = entities.slice(_queryOptions.skip);
          } else {
            entities = entities.slice(_queryOptions.skip, _queryOptions.skip + _queryOptions.limit);
          }
        }
        var vms = _.map(entities, function (data) {
            var vm = new ViewModel(data, self);
            vm.actionOnCommit = 'update';
            return vm;
        });

        _callback(null, vms);
      });
    });
  },
  findOne: function (query, queryOptions, callback) {
    var self = this;
    self.find(query, queryOptions, function (err, items) {
      if (err) {
        return callback(err);
      }
      callback(null, items[0]);
    });
  },
  commit: function(vm, callback) {
    var self = this;
    self.checkConnection(function(err) {
      if (err) {
        return callback(err);
      }
      if (!vm.actionOnCommit) return callback(new Error());

      var objDescriptor = {
        HashKey: vm.id,
        RangeKey: vm.id
      };

      var obj, entity;
      switch (vm.actionOnCommit) {
        case 'delete':
          obj = vm.toJSON();
          if(!_.has(obj, 'hash_')){
            if (callback) callback(null, vm);
            return;
          }
          entity = deleteEntityParams(self.collectionName, objDescriptor, _.get(obj, 'hash_'));
          self.documentClient.delete(entity, function(err) {
            if (err) {
              if (err.code == 'ConditionalCheckFailedException')
                err = new ConcurrencyError();
              if (callback) callback(err);
              return;
            } else {
              if (callback) callback(null, vm);
            }
          });
          break;
        case 'create':
          obj = vm.toJSON();
          entity = createEntityParams(self.collectionName, obj, objDescriptor);
          self.documentClient.put(entity, function(err, data) {
            if (err) {
              if (err.code == 'ConditionalCheckFailedException')
                err = new ConcurrencyError();
              if (callback) callback(err);
              return;
            }
            vm.actionOnCommit = 'update';
            if (callback) callback(null, vm);
          });
          break;
        case 'update':
          obj = vm.toJSON();
          var currentHash = _.get(obj, 'hash_');
          entity = currentHash ? 
            updateEntityParams(self.collectionName, obj, objDescriptor, currentHash) :
            createEntityParams(self.collectionName, obj, objDescriptor);
          self.documentClient.put(entity, function(err, data) {
            if (err) {
              if (err.code == 'ConditionalCheckFailedException')
                err = new ConcurrencyError();
              if (callback) callback(err);
              return;
            }
            vm.actionOnCommit = 'update';
            if (callback) callback(null, vm);
          });
          break;
        default:
          return callback(new Error());
      }
    });
  },
  checkConnection: function(callback) {
    var self = this;
    createTableIfNotExists(
      self.client, 
      CollectionTableDefinition(self.collectionName, self.options), 
      function(err){
        if (err) {
          if (callback) callback(err);
        } else {
          if (collections.indexOf(self.collectionName) < 0) {
            collections.push(self.collectionName);
          }
          if (callback) callback(err);
        }
      }
    );
  },
  clear: function(callback) {
    var self = this;
    var query = {
      TableName: self.collectionName
    };
    self.documentClient.scan(query, function(err, entities) {
      if (err) {
        return callback(err);
      }

      async.each(
        entities.Items,
        function(entity, callback) {
          const { HashKey, RangeKey } = entity;
          var params = {
            TableName: self.collectionName,
            Key: { HashKey, RangeKey }
          };
          self.documentClient.delete(params, function(error, response) {
            callback(error);
          });
        },
        function(error) {
          callback(error);
        }
      );
    });
  },
  clearAll: function(callback) {
    var self = this;

    async.each(
      collections,
      function(collection, callback) {
        var query = {
          TableName: collection
        };
        self.documentClient.scan(query, function(err, entities) {
          if (err) {
            return callback(err);
          }
          async.each(
            entities.Items,
            function(entity, callback) {
              const { HashKey, RangeKey } = entity;
              var params = {
                TableName: collection,
                Key: { HashKey, RangeKey }
              };
              self.documentClient.delete(params, function(error, response) {
                callback(error);
              });
            },
            function(error) {
              callback(error);
            }
          );
        });
      },
      callback
    );
  }
});

function queryToScanParams(tableName, query, queryOptions){
  var limit = queryOptions.skip + queryOptions.limit;
  var scanFilter = _.reduce(query, (result, value, key) => {
    result[key] = {
      ComparisonOperator: 'EQ',
      AttributeValueList: [ value]
    };
    return result;
  }, {});
  var params = {
      TableName: tableName,
      ScanFilter: scanFilter
  };
  if(limit > 0){
    return _.set(params, 'Limit', limit);
  }
  return params;
}

function createEntityParams(collectionName, obj, objDescriptor) {
  return {
    TableName: collectionName,
    Item: _.assign(obj, objDescriptor, { 'hash_': uuid().toString() }),
    ConditionExpression: 'attribute_not_exists(HashKey)'
  };
}

function deleteEntityParams(collectionName, objDescriptor, currentHash) {
  return {
    TableName: collectionName,
    Key: objDescriptor,
    ConditionExpression: 'attribute_not_exists(HashKey) or hash_ = :hash',
    ExpressionAttributeValues: {
      ':hash': currentHash
    }
  };
}

function updateEntityParams(collectionName, obj, objDescriptor, currentHash) {
  return {
    TableName: collectionName,
    Item: _.assign(obj, objDescriptor, { 'hash_': uuid().toString() }),
    ConditionExpression: 'attribute_not_exists(HashKey) or hash_ = :hash',
    ExpressionAttributeValues: {
      ':hash': currentHash
    }
  };
}

function CollectionTableDefinition(collectionName, opts) {
  var def = {
    TableName: collectionName,
    KeySchema: [
      { AttributeName: 'HashKey', KeyType: 'HASH' },
      { AttributeName: 'RangeKey', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'HashKey', AttributeType: 'S' },
      { AttributeName: 'RangeKey', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: opts.ReadCapacityUnits,
      WriteCapacityUnits: opts.WriteCapacityUnits
    }
  };

  return def;
}

var createTableIfNotExists = function(client, params, callback) {
  var exists = function(p, cbExists) {
    client.describeTable({ TableName: p.TableName }, function(err, data) {
      /* istanbul ignore else */
      if (err) {
        /* istanbul ignore else */
        if (err.code === 'ResourceNotFoundException') {
          cbExists(null, { exists: false, definition: p });
        } else {
          cbExists(err);
        }
      } else {
        cbExists(null, { exists: true, description: data });
      }
    });
  };

  var create = function(r, cbCreate) {
    if (!r.exists) {
      client.createTable(r.definition, function(err, data) {
        if (err) {
          cbCreate(err);
        } else {
          cbCreate(null, {
            Table: {
              TableName: data.TableDescription.TableName,
              TableStatus: data.TableDescription.TableStatus
            }
          });
        }
      });
    } else {
      cbCreate(null, r.description);
    }
  };

  var active = function(d, cbActive) {
    var status = d.Table.TableStatus;
    async.until(
      function() {
        return status === 'ACTIVE';
      },
      function(cbUntil) {
        client.describeTable({ TableName: d.Table.TableName }, function(
          err,
          data
        ) {
          if (err) {
            cbUntil(err);
          } else {
            status = data.Table.TableStatus;
            setTimeout(cbUntil, 1000);
          }
        });
      },
      function(err, r) {
        if (err) {
          return cbActive(err);
        }
        cbActive(null, r);
      }
    );
  };

  async.compose(active, create, exists)(params, function(err, result) {
    if (err) callback(err);
    else callback(null, result);
  });
};

module.exports = DynamoDB;
