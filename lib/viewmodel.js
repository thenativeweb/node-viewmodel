'use strict';

var _ = require('lodash'),
    dotty = require('dotty'),
    jsondate = require('jsondate'),
    Repository = require('./base');

/**
 * ViewModel constructor
 * @param {String} attr The attributes of this viewmodel instance.
 */
function ViewModel (attr, repository, version) {
  if (!repository) {
    var errMsg = 'Please pass in a valid repository';
    console.log(errMsg);
    throw new Error(errMsg);
  }

  for (var f in Repository.prototype) {
    if (!_.isFunction(repository[f])) {
      var errMsg = 'Please pass in a valid repository';
      console.log(errMsg);
      throw new Error(errMsg);
    }
  }

  if (attr.id) {
    this.id = _.clone(attr.id);
  }

  // version addition, used by elasticsearch6, null means a new model
  if (version !== undefined)
    this.version = _.clone(version);

  this.actionOnCommit = 'create';
  this.repository = repository;

  this.attributes = _.cloneDeep(attr);
}

_.extend(ViewModel.prototype, {

  /**
   * Will delete the viewmodel on next commit.
   */
  destroy: function () {
    this.actionOnCommit = 'delete';
  },

  /**
   * Use this function to commit/save a viewmodel.
   * @param  {Function} callback The function, that will be called when the this action is completed.
   *                             `function(err){}`
   */
  commit: function (callback) {
    this.repository.commit(this, callback);
  },

  /**
   * The toJSON function will be called when JSON.stringify().
   * @return {Object} A clean Javascript object containing all attributes.
   */
  toJSON: function () {
    return jsondate.parse(JSON.stringify(this.attributes));
  },

  /**
   * Sets attributes for the vm.
   *
   * @example:
   *     vm.set('firstname', 'Jack');
   *     // or
   *     vm.set({
   *          firstname: 'Jack',
   *          lastname: 'X-Man'
   *     });
   */
  set: function (data) {
    if (arguments.length === 2) {
      dotty.put(this.attributes, arguments[0], arguments[1]);
    } else if (_.isObject(data)) {
      for (var m in data) {
        dotty.put(this.attributes, m, data[m]);
      }
    }
  },

  /**
   * Gets an attribute of the vm.
   * @param  {String} attr The attribute name.
   * @return {Object}      The result value.
   *
   * @example:
   *     vm.get('firstname'); // returns 'Jack'
   */
  get: function (attr) {
    return dotty.get(this.attributes, attr);
  },

  /**
   * Returns `true` if the attribute contains a value that is not null
   * or undefined.
   * @param  {String} attr The attribute name.
   * @return {Boolean}     The result value.
   *
   * @example:
   *     vm.has('firstname'); // returns true or false
   */
  has: function (attr) {
    return (this.get(attr) !== null && this.get(attr) !== undefined);
  }

});

module.exports = ViewModel;
