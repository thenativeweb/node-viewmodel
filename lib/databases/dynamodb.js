'use strict';

var util = require('util'),
  Repository = require('../base'),
  ConcurrencyError = require('../concurrencyError'),
  ViewModel = Repository.ViewModel,
  async = require('async'),
  uuid = require('uuid').v4,
  aws = Repository.use('aws-sdk'),
  _ = require('lodash'),
  collections = [];

function DynamoDB(options) {

  var awsConf = {
    region: 'ap-southeast-2',
    endpointConf: {}
  };

  if (process.env['AWS_DYNAMODB_ENDPOINT']) {
    awsConf.endpointConf = { endpoint: process.env['AWS_DYNAMODB_ENDPOINT'] };
  }

  this.options = _.defaults(options, awsConf);

  var defaults = {
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
    self.documentClient = new aws.DynamoDB.DocumentClient({ service: self.client });
    self.isConnected = true;
    self.emit('connect');
    if (callback) callback(null, self);
  },

  disconnect: function(callback) {
    this.emit('disconnect');
    if (callback) callback(null);
  },

  get: function(id, callback) {
    var self = this,
      options = {};

    if (_.isFunction(id)) {
      callback = id;
      id = null;
    }

    if (!id) {
      id = uuid().toString();
    }
    self.checkConnection(function(err) {
      if (err) {
        if (callback) callback(err);
        return;
      }

      var params = {
        TableName: self.collectionName,
        Key: {
          HashKey: id,
          RangeKey: id
        }
      };

      self.documentClient.get(params, function(err, data) {
        if (err) {
          if (callback) callback(err);
          return;
        } else {
          if (!data || !data.Item) {
            return callback(null, new ViewModel({ id: id }, self))  ;
          }
          var vm = new ViewModel(data.Item, self);
          vm.actionOnCommit = 'update';
          callback(null, vm);
        }
      });
    });
  },
  find: function(query, queryOptions, callback) {
    var self = this;

    if (_.isFunction(query)) {
      callback = query;
      query = {};
      queryOptions = {};
    } else if (_.isFunction(queryOptions)) {
      callback = queryOptions;
      query = query;
      queryOptions = {};
    }

    self.checkConnection(function(err) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      queryOptions = _.defaults(queryOptions, {skip: 0, limit: -1});
      var params = queryToScanParams(self.collectionName, query, queryOptions);
      self.documentClient.scan(params, function(err, data) {
        if (err) callback(err);
        var entities = _.get(data, 'Items', []);
        if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
          if (queryOptions.limit === -1) {
            entities = entities.slice(queryOptions.skip);
          } else {
            entities = entities.slice(queryOptions.skip, queryOptions.skip + queryOptions.limit);
          }
        }
        var vms = _.map(entities, function (data) {
            var vm = new ViewModel(data, self);
            vm.actionOnCommit = 'update';
            return vm;
        });

        callback(null, vms);
      });
    });
  },
  findOne: function (query, queryOptions, callback) {
    var self = this;
    self.find(query, queryOptions, function (err, items) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      callback(null, items[0]);
    });
  },
  commit: function(vm, callback) {
    var self = this;
    self.checkConnection(function(err) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      if (!vm.actionOnCommit) return callback(new Error());

      var objDescriptor = {
        HashKey: vm.id,
        RangeKey: vm.id
      };

      var obj, entity;
      switch (vm.actionOnCommit) {
        case 'delete':
          obj = vm.attributes;
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
          obj = vm.attributes;
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
          obj = vm.attributes;
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
          // ignore ResourceInUseException
          // as there could be multiple requests attempt to create table concurrently
          if (err.code === 'ResourceInUseException') {
            if (callback) callback(null);
            return;
          }
          if (callback) callback(err);
          return;
        }
        if (collections.indexOf(self.collectionName) < 0) {
          collections.push(self.collectionName);
        }
        if (callback) callback(err);
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
        if (callback) callback(err);
        return;
      }

      async.each(
        entities.Items,
        function(entity, callback) {
          var params = {
            TableName: self.collectionName,
            Key: { HashKey: entity.HashKey, RangeKey: entity.RangeKey }
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
            if (callback) callback(err);
            return;
          }
          async.each(
            entities.Items,
            function(entity, callback) {
              var params = {
                TableName: collection,
                Key: { HashKey: entity.HashKey, RangeKey: entity.RangeKey }
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

function createDynamoParams(obj, objPrefix) {
  objPrefix = objPrefix ? objPrefix + '.#' : '#';

  return _.reduce(obj, function (result, value, key) {
      var valueSearchedFor = obj[key];
      var dotNotatedTargetAttribute = objPrefix + key;

      if(_.isPlainObject(valueSearchedFor)) {
        result.expressionAttributeNames['#' + key] = key;

        const newCondition = createDynamoParams(valueSearchedFor, dotNotatedTargetAttribute);
        result.expressionAttributeNames = _.merge(
          result.expressionAttributeNames,
          newCondition.expressionAttributeNames);

        result.expressionAttributeValues = _.merge(
          result.expressionAttributeValues,
          newCondition.expressionAttributeValues);

        if (!_.isEmpty(newCondition.filterExpression)) {
          result.filterExpression = result.filterExpression.concat(
            _.isEmpty(result.filterExpression) ? '' : ' AND ',
            newCondition.filterExpression);
        }
      } else {
          var attributeVariable = ':' + dotNotatedTargetAttribute.replace(/(\.|#)/g, '');
          var attributeValueKey = '#' + key;

          if (result.filterExpression !== '') {
            result.filterExpression = result.filterExpression.concat(' AND ');
          }

          result.filterExpression = result.filterExpression.concat(
            dotNotatedTargetAttribute,
            ' = ',
            attributeVariable);

          result.expressionAttributeValues[attributeVariable] = valueSearchedFor;
          result.expressionAttributeNames['#' + key] = key;
      }

      return result;
  },
  {
    expressionAttributeNames: {},
    filterExpression: '',
    expressionAttributeValues: {}
  })
};

function queryToScanParams(tableName, query, queryOptions){
  var limit = queryOptions.skip + queryOptions.limit;
  var params = {
    TableName: tableName,
  }

  if (limit > 0) {
    params.Limit = limit;
  }

  if (_.isEmpty(query)) {
    return params;
  }

  var dynamoParams = createDynamoParams(query);
  params.FilterExpression = dynamoParams.filterExpression;
  params.ExpressionAttributeNames = dynamoParams.expressionAttributeNames;
  params.ExpressionAttributeValues = dynamoParams.expressionAttributeValues;

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
      if (err) {
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
