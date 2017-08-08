'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    _ = require('lodash'),
    prequire = require('parent-require'),
    uuid = require('uuid').v4,
    ViewModel = require('./viewmodel');

/**
 * Repository constructor
 * @param {Object} options The options can have information like host, port, etc. [optional]
 */
function Repository(options) {
  options = options || {};
  this.repositoryType = (typeof(options.type) === 'string') ? options.type : null;

  EventEmitter.call(this);
}

util.inherits(Repository, EventEmitter);

function implementError (callback) {
  var err = new Error('Storage method add is not implemented');
  if (callback) callback(err);
  throw err;
}

_.extend(Repository.prototype, {

  /**
   * Initiate communication with the queue.
   * @param  {Function} callback The function, that will be called when the this action is completed. [optional]
   *                             `function(err, queue){}`
   */
  connect: implementError,

  /**
   * Terminate communication with the queue.
   * @param  {Function} callback The function, that will be called when the this action is completed. [optional]
   *                             `function(err){}`
   */
  disconnect: implementError,

  /**
   * Use this function to obtain a new id.
   * @param  {Function} callback The function, that will be called when the this action is completed.
   *                             `function(err, id){}` id is of type String.
   */
  getNewId: function (callback) {
    var id = uuid().toString();
    if (callback) callback(null, id);
  },

  /**
   * Use this function to push something in the queue.
   * @param  {String}   id       The id for this item. [optional] if not passed it will generate an id.
   * @param  {Function} callback The function, that will be called when the this action is completed. [optional]
   *                             `function(err, vm){}` vm is of type Object
   */
  get: function (id, callback) {
    implementError(callback);
  },

  /**
   * Use this function to find viewmodels.
   * @param  {String}   query    The query to find the viewmodels. (mongodb style) [optional]
   * @param  {Function} callback The function, that will be called when the this action is completed.
   *                             `function(err, items){}` items is of type Array.
   */
  find: function (query, queryOptions, callback) {
    if (!callback) {
      callback = queryOptions;
      queryOptions = {};
    }
    implementError(callback);
  },

  /**
   * Use this function to find one viewmodel.
   * @param  {String}   query    The query to find the viewmodel. (mongodb style) [optional]
   * @param  {Function} callback The function, that will be called when the this action is completed.
   *                             `function(err, vm){}` vm is of type Object.
   */
  findOne: function (query, queryOptions, callback) {
    if (!queryOptions) {
      callback = query;
      query = {};
      queryOptions = {};
    } else if (!callback) {
      callback = queryOptions;
      queryOptions = {};
    }

    this.find(query, queryOptions, function (err, items) {
      if (err) {
        return callback(err);
      }
      callback(null, items[0]);
    });
  },

  /**
   * Use this function to commit/save a viewmodel.
   * @param  {Object}   vm       The vm to commit.
   * @param  {Function} callback The function, that will be called when the this action is completed.
   *                             `function(err){}`
   */
  commit: function (vm, callback) {
    implementError(callback);
  },

  /**
   * Use this function to check if all is initialized correctly.
   * @param  {Function} callback The function, that will be called when the this action is completed. [optional]
   *                             `function(err){}`
   */
  checkConnection: function (callback) {
    if (callback) callback(null);
  },

  /**
   * Clears the complete collection...
   * @param {Function} callback the function that will be called when this action has finished [optional]
   */
  clear: function (callback) {
    implementError(callback);
  },

  /**
   * NEVER USE THIS FUNCTION!!! ONLY FOR TESTS!
   * clears the complete store...
   * @param {Function} callback the function that will be called when this action has finished [optional]
   */
  clearAll: function (callback) {
    implementError(callback);
  },

  /**
   * Use this function to extend this repository with the appropriate collectionName and perhaps other stuff.
   * @param  {Object} obj The object that should be extended.
   * @return {Object}     The extended object.
   */
  extend: function (obj) {
    var res = _.assign(_.assign({}, this), obj);
    for (var f in this) {
      if (_.isFunction(this[f])) {
        res[f] = this[f];
      }
    }
    if (_.isFunction(res.checkConnection)) {
      res.checkConnection();
    }
    return res;
  }

});

Repository.ViewModel = ViewModel;

Repository.use = function (toRequire) {
  var required;
  try {
    required = require(toRequire);
  } catch (e) {
    // workaround when `npm link`'ed for development
    required = prequire(toRequire);
  }
  return required;
};

module.exports = Repository;
