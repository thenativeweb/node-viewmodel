'use strict';

var tolerate = require('tolerance'),
    Base = require('./base'),
    ConcurrencyError = require('./concurrencyError'),
    jsondate = require('jsondate'),
    _ = require('lodash');

function exists(toCheck) {
  var _exists = require('fs').existsSync || require('path').existsSync;
  if (require('fs').accessSync) {
    _exists = function (toCheck) {
      try {
        require('fs').accessSync(toCheck);
        return true;
      } catch (e) {
        return false;
      }
    };
  }
  return _exists(toCheck);
}

function getSpecificRepository(options) {
  options = options || {};

  options.type = options.type || 'inmemory';

  if (_.isFunction(options.type)) {
    return options.type;
  }

  options.type = options.type.toLowerCase();

  var dbPath = __dirname + "/databases/" + options.type + ".js";

  if (!exists(dbPath)) {
    var errMsg = 'Implementation for db "' + options.type + '" does not exist!';
    console.log(errMsg);
    throw new Error(errMsg);
  }

  try {
    var db = require(dbPath);
    return db;
  } catch (err) {

    if (err.message.indexOf('Cannot find module') >= 0 &&
        err.message.indexOf("'") > 0 &&
        err.message.lastIndexOf("'") !== err.message.indexOf("'")) {

      var moduleName = err.message.substring(err.message.indexOf("'") + 1, err.message.lastIndexOf("'"));
      console.log('Please install module "' + moduleName +
                  '" to work with db implementation "' + options.type + '"!');
    }

    throw err;
  }
}

function init (options) {
  options = options || {};

  var Repository;

  try {
    Repository = getSpecificRepository(options);
  } catch (err) {
    throw err;
  }

  var repo = new Repository(options);
  return repo;
}

function connect (repo, options, callback) {
  if (!callback) {
    return;
  }
  process.nextTick(function() {
    tolerate(function(callback) {
      repo.connect(callback);
    }, options.timeout || 0, callback);
  });
}

function permissionError (callback) {
  var err = new Error('This is a read instance! You are not allowed to execute this function!');
  if (callback) callback(err);
  throw err;
}

function removeWriteStuffFromVm (vm) {
  if (!vm) { return; }
  vm.destroy = permissionError;
  vm.set = function() {
    permissionError();
  };
}

function extend (toExtend, extension) {
  var res = _.assign(_.assign({}, toExtend), extension);
  for (var f in toExtend) {
    if (_.isFunction(toExtend[f])) {
      res[f] = toExtend[f];
    }
  }
  return res;
}

module.exports = {
  Repository: Base,
  ViewModel: Base.ViewModel,
  ConcurrencyError: ConcurrencyError,

  write: function (options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = options || {};

    try {
      var repo = init(options);
      var orgCommit = repo.commit;
      repo.commit = function (vm, callback) {
        vm.set('commitStamp', (new Date()).getTime());
        orgCommit.apply(this, [vm, callback]);
      };
      var orgFind = repo.find;
      repo.find = function (query, queryOptions, callback) {
        if (typeof query === 'function') {
          callback = query;
          query = {};
          queryOptions = {};
        }
        if (typeof queryOptions === 'function') {
          callback = queryOptions;
          queryOptions = {};
        }
        orgFind.apply(this, [query, queryOptions, function (err, res) {
          if (err) {
            return callback(err);
          }

          if (!res || res.length === 0) {
            res = [];
          }

          res.toJSON = function () {
            delete res.toJSON;
            return jsondate.parse(JSON.stringify(res));
          };

          callback(null, res);
        }]);
      };
      var orgFindOne = repo.findOne;
      repo.findOne = function (query, queryOptions, callback) {
        if (typeof query === 'function') {
          callback = query;
          query = {};
          queryOptions = {};
        }
        if (typeof queryOptions === 'function') {
          callback = queryOptions;
          queryOptions = {};
        }
        orgFindOne.apply(this, [query, queryOptions, callback]);
      };
      // Do not modify anything... it's write and we can do everything!!!
      connect(repo, options, callback);
      return repo;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  },

  read: function (options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = options || {};

    try {
      var repo = init(options);

      // remove write stuff!!!
      repo.commit = function (vm, callback) {
        permissionError(callback);
      };
      repo.clear = function (callback) {
        permissionError(callback);
      };
      var orgGet = repo.get;
      repo.get = function (id, callback) {
        if (typeof id === 'function') {
          callback = id;
          id = null;
        }
        orgGet.apply(this, [id, function (err, res) {
          if (err) {
            return callback(err);
          }

          if (res.actionOnCommit === 'create') {
            res = null;
          } else {
            removeWriteStuffFromVm(res);
          }

          callback(null, res);
        }]);
      };
      var orgFind = repo.find;
      repo.find = function (query, queryOptions, callback) {
        if (typeof query === 'function') {
          callback = query;
          query = {};
          queryOptions = {};
        }
        if (typeof queryOptions === 'function') {
          callback = queryOptions;
          queryOptions = {};
        }
        orgFind.apply(this, [query, queryOptions, function (err, res) {
          if (err) {
            return callback(err);
          }

          if (!res || res.length === 0) {
            res = [];
          }

          _.each(res, function (item) {
            removeWriteStuffFromVm(item);
          });

          res.toJSON = function () {
            delete res.toJSON;
            return jsondate.parse(JSON.stringify(res));
          };

          callback(null, res);
        }]);
      };
      var orgFindOne = repo.findOne;
      repo.findOne = function (query, queryOptions, callback) {
        if (typeof query === 'function') {
          callback = query;
          query = {};
          queryOptions = {};
        }
        if (typeof queryOptions === 'function') {
          callback = queryOptions;
          queryOptions = {};
        }
        orgFindOne.apply(this, [query, queryOptions, function (err, res) {
          if (err) {
            return callback(err);
          }

          removeWriteStuffFromVm(res);

          callback(null, res);
        }]);
      };

      connect(repo, options, callback);
      return repo;
    } catch (err) {
      if (callback) callback(err);
      throw err;
    }
  }
};
