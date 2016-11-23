'use strict';

var util = require('util'),
  Repository = require('../base'),
  ViewModel = Repository.ViewModel,
  ConcurrencyError = require('../concurrencyError'),
  DocumentClient = Repository.use('documentdb').DocumentClient,
  DoQmentDB = Repository.use('doqmentdb'),
  async = require('async'),
  uuid = require('uuid').v4,
  _ = require('lodash'),
  jsondate = require('jsondate'),
  collections = [];

// Class
function Document(options) {
  Repository.call(this, options);

  options = options || {};

  var defaultConf = {
    host: 'https://nubiz-opensource.documents.azure.com:443/',
    masterKey: '1A5vuEdjyl3zrqxuMASlB/4QGwllQsIroyrPmVXVslkfnaxYSEvA/H4QUrRCp4IUiG6rOuXUxEHX0SCGfsjPuA==',
    dbName: 'node-viewmodel'
  };

  this.options = _.defaults(options, defaultConf);
}

util.inherits(Document, Repository);

_.extend(Document.prototype, {

  connect: function (callback) {

    var self = this;
    var options = this.options;

    this.client = new DocumentClient(options.host, {masterKey: options.masterKey});

    this.db = new DoQmentDB(this.client, options.dbName);

    self.emit('connect');

    if (callback) callback(null, self);

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


    this.checkConnection();

    this.collection.findById(id)
      .then(function (document) {
        if (!document) {
          return callback(null, new ViewModel({id: id}, self));
        }

        var entity = _.omit(document, ['_attachments', '_etag', '_rid', '_self', '_ts'])
        var vm = new ViewModel(entity, self);
        vm.actionOnCommit = 'update';
        callback(null, vm);
      })
      .error(function (err) {
        callback(err);
      });

  },

  find: function (query, queryOptions, callback) {

    var self = this;

    this.checkConnection();

    this.collection.find(query)
      .then(function (docs) {

        if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
          docs = docs.slice(queryOptions.skip, queryOptions.limit + queryOptions.skip + 1);
        }

        var vms = _.map(docs, function (doc) {
          var vm = new ViewModel(doc, self);
          vm.actionOnCommit = 'update';
          return vm;
        });

        callback(null, vms);
      });
  },

  commit: function (vm, callback) {

    var self = this;

    self.checkConnection();

    if (!vm.actionOnCommit) return callback(new Error());

    switch (vm.actionOnCommit) {
      case 'delete':

        this.collection.findOneAndRemove({id: vm.id})
          .finally(callback);

        break;

      case 'create':

        this.collection.create(vm.toJSON())
          .then(function (doc) {
            vm.actionOnCommit = 'update';
            if (callback) callback(null, vm);
          })
          .error(function (err) {
            if (err.code == '409') {
              err = new ConcurrencyError();
            }
            if (callback) callback(err);
          });

        break;

      case 'update':

        this.collection.findOrCreate({id: vm.id})
          .then(function (doc){
            return self.collection.findOneAndModify({id: vm.id}, vm.toJSON());
          })
          .then(function (doc) {

            vm.actionOnCommit = 'update';
            if (callback) callback(null, vm);
          })
          .error(callback);

        break;

      default:
        return callback(new Error());
    }
  },

  checkConnection: function () {
    var self = this;

    if (this.collection) {
      return this.collection;
    }

    if (collections.indexOf(this.collectionName) < 0) {
      collections.push(this.collectionName)
    }

    this.collection = this.db.use(this.collectionName);
  },

  clear: function (callback) {
    var self = this;

    this.checkConnection();

    if (!this.collection) {
      if (callback) callback(null);
      return;
    }

    this.collection.findAndRemove({}).finally(callback)
  },

  clearAll: function (callback) {

    var self = this;
    async.each(collections, function (col, callback) {
      self.db.use(col).findAndRemove({}).finally(callback)
    }, callback);

  }
})
;

module.exports = Document;
