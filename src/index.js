import { utils } from 'js-data'
import {
  Adapter,
  reserved
} from 'js-data-adapter'
import { DocumentClient } from 'documentdb'
import underscore from 'mout/string/underscore'

const REQUEST_OPTS_DEFAULTS = {}
const FEED_OPTS_DEFAULTS = {}

const checkIfNameExists = function (name, parameters) {
  let exists = false
  parameters.forEach(function (parameter) {
    if (parameter.name === name) {
      exists = true
      return false
    }
  })
  return exists
}

const addParameter = function (field, value, parameters) {
  const name = `@${field}`
  let newName = name
  let count = 1

  while (checkIfNameExists(newName, parameters)) {
    newName = name + count
    count++
  }
  parameters.push({
    name: newName,
    value
  })
  return newName
}

const equal = function (field, value, parameters, collectionId) {
  return `${collectionId}.${field} = ${addParameter(field, value, parameters)}`
}

const notEqual = function (field, value, parameters, collectionId) {
  return `${collectionId}.${field} != ${addParameter(field, value, parameters)}`
}

/**
 * Default predicate functions for the filtering operators. These produce the
 * appropriate SQL and add the necessary parameters.
 *
 * @name module:js-data-documentdb.OPERATORS
 * @property {function} = Equality operator.
 * @property {function} == Equality operator.
 * @property {function} != Inequality operator.
 * @property {function} > "Greater than" operator.
 * @property {function} >= "Greater than or equal to" operator.
 * @property {function} < "Less than" operator.
 * @property {function} <= "Less than or equal to" operator.
 * @property {function} in Operator to test whether a value is found in the
 * provided array.
 * @property {function} notIn Operator to test whether a value is NOT found in
 * the provided array.
 * @property {function} contains Operator to test whether an array contains the
 * provided value.
 * @property {function} notContains Operator to test whether an array does NOT
 * contain the provided value.
 */
export const OPERATORS = {
  '=': equal,
  '==': equal,
  '===': equal,
  '!=': notEqual,
  '!==': notEqual,
  '>': function (field, value, parameters, collectionId) {
    return `${collectionId}.${field} > ${addParameter(field, value, parameters)}`
  },
  '>=': function (field, value, parameters, collectionId) {
    return `${collectionId}.${field} >= ${addParameter(field, value, parameters)}`
  },
  '<': function (field, value, parameters, collectionId) {
    return `${collectionId}.${field} < ${addParameter(field, value, parameters)}`
  },
  '<=': function (field, value, parameters, collectionId) {
    return `${collectionId}.${field} <= ${addParameter(field, value, parameters)}`
  },
  'in': function (field, value, parameters, collectionId) {
    return `ARRAY_CONTAINS(${addParameter(field, value, parameters)}, ${collectionId}.${field})`
  },
  'notIn': function (field, value, parameters, collectionId) {
    // return `${collectionId}.${field} NOT IN ${addParameter(field, value, parameters)}`
    return `NOT ARRAY_CONTAINS(${addParameter(field, value, parameters)}, ${collectionId}.${field})`
  },
  'contains': function (field, value, parameters, collectionId) {
    return `ARRAY_CONTAINS(${collectionId}.${field}, ${addParameter(field, value, parameters)})`
  },
  'notContains': function (field, value, parameters, collectionId) {
    return `NOT ARRAY_CONTAINS(${collectionId}.${field}, ${addParameter(field, value, parameters)})`
  }
}

Object.freeze(OPERATORS)

/**
 * DocumentDBAdapter class.
 *
 * @example
 * // Use Container instead of DataStore on the server
 * import { Container } from 'js-data';
 * import { DocumentDBAdapter } from 'js-data-documentdb';
 *
 * // Create a store to hold your Mappers
 * const store = new Container();
 *
 * // Create an instance of DocumentDBAdapter with default settings
 * const adapter = new DocumentDBAdapter({
 *   documentOpts: {
 *     db: 'mydb',
 *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
 *     auth: {
 *       masterKey: process.env.DOCUMENT_DB_KEY
 *     }
 *   }
 * });
 *
 * // Mappers in "store" will use the DocumentDB adapter by default
 * store.registerAdapter('documentdb', adapter, { 'default': true });
 *
 * // Create a Mapper that maps to a "user" table
 * store.defineMapper('user');
 *
 * @class DocumentDBAdapter
 * @extends Adapter
 * @param {object} [opts] Configuration options.
 * @param {object} [opts.client] See {@link DocumentDBAdapter#client}.
 * @param {boolean} [opts.debug=false] See {@link Adapter#debug}.
 * @param {object} [opts.documentOpts={}] See {@link DocumentDBAdapter#documentOpts}.
 * @param {object} [opts.feedOpts={}] See {@link DocumentDBAdapter#feedOpts}.
 * @param {object} [opts.operators={@link module:js-data-documentdb.OPERATORS}] See {@link DocumentDBAdapter#operators}.
 * @param {boolean} [opts.raw=false] See {@link Adapter#raw}.
 * @param {object} [opts.requestOpts={}] See {@link DocumentDBAdapter#requestOpts}.
 */
export function DocumentDBAdapter (opts) {
  utils.classCallCheck(this, DocumentDBAdapter)
  opts || (opts = {})

  // Setup non-enumerable properties
  Object.defineProperties(this, {
    /**
     * The DocumentDB client used by this adapter. Use this directly when you
     * need to write custom queries.
     *
     * @example <caption>Use default instance.</caption>
     * import { DocumentDBAdapter } from 'js-data-documentdb';
     * const adapter = new DocumentDBAdapter()
     * adapter.client.createDatabase('foo', function (err, db) {...});
     *
     * @example <caption>Configure default instance.</caption>
     * import { DocumentDBAdapter } from 'js-data-documentdb';
     * const adapter = new DocumentDBAdapter({
     *   documentOpts: {
     *     db: 'mydb',
     *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
     *     auth: {
     *       masterKey: process.env.DOCUMENT_DB_KEY
     *     }
     *   }
     * });
     * adapter.client.createDatabase('foo', function (err, db) {...});
     *
     * @example <caption>Provide a custom instance.</caption>
     * import { DocumentClient } from 'documentdb';
     * import { DocumentDBAdapter } from 'js-data-documentdb';
     * const client = new DocumentClient(...)
     * const adapter = new DocumentDBAdapter({
     *   client: client
     * });
     * adapter.client.createDatabase('foo', function (err, db) {...});
     *
     * @name DocumentDBAdapter#client
     * @type {object}
     */
    client: {
      writable: true,
      value: undefined
    },
    databases: {
      value: {}
    },
    indices: {
      value: {}
    },
    collections: {
      value: {}
    }
  })

  Adapter.call(this, opts)

  /**
   * Default options to pass to DocumentClient requests.
   *
   * @name DocumentDBAdapter#requestOpts
   * @type {object}
   * @default {}
   */
  this.requestOpts || (this.requestOpts = {})
  utils.fillIn(this.requestOpts, REQUEST_OPTS_DEFAULTS)

  /**
   * Default options to pass to DocumentClient#queryDocuments.
   *
   * @name DocumentDBAdapter#feedOpts
   * @type {object}
   * @default {}
   */
  this.feedOpts || (this.feedOpts = {})
  utils.fillIn(this.feedOpts, FEED_OPTS_DEFAULTS)

  /**
   * Override the default predicate functions for the specified operators.
   *
   * @name DocumentDBAdapter#operators
   * @type {object}
   * @default {}
   */
  this.operators || (this.operators = {})
  utils.fillIn(this.operators, OPERATORS)

  /**
   * Options to pass to a new `DocumentClient` instance, if one was not provided
   * at {@link DocumentDBAdapter#client}. See the [DocumentClient API][readme]
   * for instance options.
   *
   * [readme]: http://azure.github.io/azure-documentdb-node/DocumentClient.html
   *
   * @name DocumentDBAdapter#documentOpts
   * @see http://azure.github.io/azure-documentdb-node/DocumentClient.html
   * @type {object}
   * @property {string} db The default database to use.
   * @property {string} urlConnection The service endpoint to use to create the
   * client.
   * @property {object} auth An object that is used for authenticating requests
   * and must contains one of the auth options.
   * @property {object} auth.masterkey The authorization master key to use to
   * create the client.
   * Keys for the object are resource Ids and values are the resource tokens.
   * @property {object[]} auth.resourceTokens An object that contains resources tokens.
   * Keys for the object are resource Ids and values are the resource tokens.
   * @property {string} auth.permissionFeed An array of Permission objects.
   * @property {string} [connectionPolicy] An instance of ConnectionPolicy class.
   * This parameter is optional and the default connectionPolicy will be used if
   * omitted.
   * @property {string} [consistencyLevel] An optional parameter that represents
   * the consistency level. It can take any value from ConsistencyLevel.
   */
  this.documentOpts || (this.documentOpts = {})

  if (!this.client) {
    this.client = new DocumentClient(
      this.documentOpts.urlConnection,
      this.documentOpts.auth,
      this.documentOpts.connectionPolicy,
      this.documentOpts.consistencyLevel
    )
  }
}

Adapter.extend({
  constructor: DocumentDBAdapter,

  _count (mapper, query, opts) {
    opts || (opts = {})
    query || (query = {})

    const collectionId = mapper.collection || underscore(mapper.name)
    opts.select = `${collectionId}.${mapper.idAttribute}`

    return this._findAll(mapper, query, opts)
      .then((result) => [result[0].length, { found: result[0].length }])
  },

  _create (mapper, props, opts) {
    props || (props = {})
    opts || (opts = {})

    return new utils.Promise((resolve, reject) => {
      this.client.createDocument(
        this.getCollectionLink(mapper, opts),
        utils.plainCopy(props),
        this.getOpt('requestOpts', opts),
        (err, document) => {
          if (err) {
            return reject(err)
          }
          return resolve([document, { created: 1 }])
        }
      )
    })
  },

  _createMany (mapper, props, opts) {
    props || (props = {})
    opts || (opts = {})

    return utils.Promise.all(props.map((record) => this._create(mapper, record, opts)))
      .then((results) => results.map((result) => result[0]))
      .then((results) => [results, { created: results.length }])
  },

  _destroy (mapper, id, opts) {
    opts || (opts = {})

    const collLink = this.getCollectionLink(mapper, opts)
    const requestOpts = this.getOpt('requestOpts', opts)

    return new utils.Promise((resolve, reject) => {
      this.client.deleteDocument(`${collLink}/docs/${id}`, requestOpts, (err) => {
        if (err) {
          if (err.code === 404) {
            return resolve([undefined, { deleted: 0 }])
          }
          return reject(err)
        }
        return resolve([undefined, { deleted: 1 }])
      })
    })
  },

  _destroyAll (mapper, query, opts) {
    query || (query = {})
    opts || (opts = {})

    const destroyFn = (document) => this._destroy(mapper, document.id, opts)

    return this._findAll(mapper, query, opts)
      .then((results) => utils.Promise.all(results[0].map(destroyFn)))
      .then((results) => [undefined, { deleted: results.length }])
  },

  _find (mapper, id, opts) {
    opts || (opts = {})

    const docLink = `${this.getCollectionLink(mapper, opts)}/docs/${id}`
    const requestOpts = this.getOpt('requestOpts', opts)

    return new utils.Promise((resolve, reject) => {
      this.client.readDocument(docLink, requestOpts, (err, document) => {
        if (err) {
          if (err.code === 404) {
            return resolve([undefined, { found: 0 }])
          }
          return reject(err)
        }
        return resolve([document, { found: document ? 1 : 0 }])
      })
    })
  },

  _findAll (mapper, query, opts) {
    opts || (opts = {})
    query || (query = {})

    const collLink = this.getCollectionLink(mapper, opts)
    const feedOpts = this.getOpt('feedOpts', opts)
    const querySpec = this.getQuerySpec(mapper, query, opts)

    return new utils.Promise((resolve, reject) => {
      this.client.queryDocuments(collLink, querySpec, feedOpts).toArray((err, documents) => {
        if (err) {
          return reject(err)
        }
        return resolve([documents, { found: documents.length }])
      })
    })
  },

  _sum (mapper, field, query, opts) {
    if (!utils.isString(field)) {
      throw new Error('field must be a string!')
    }
    opts || (opts = {})
    query || (query = {})

    const collectionId = mapper.collection || underscore(mapper.name)
    opts.select = `${collectionId}.${mapper.idAttribute}, ${collectionId}.${field}`

    return this._findAll(mapper, query, opts)
      .then((result) => {
        const sum = result[0].reduce((sum, cur) => sum + cur[field], 0)
        return [sum, { found: result[0].length }]
      })
  },

  _update (mapper, id, props, opts) {
    props || (props = {})
    opts || (opts = {})

    const docLink = `${this.getCollectionLink(mapper, opts)}/docs/${id}`
    const requestOpts = this.getOpt('requestOpts', opts)

    return this._find(mapper, id, opts)
      .then((result) => {
        const document = result[0]
        if (!document) {
          throw new Error('Not Found')
        }
        utils.deepMixIn(document, utils.plainCopy(props))
        return new utils.Promise((resolve, reject) => {
          this.client.replaceDocument(docLink, document, requestOpts, (err, updatedDocument) => {
            if (err) {
              return reject(err)
            }
            return resolve([updatedDocument, { updated: updatedDocument ? 1 : 0 }])
          })
        })
      })
  },

  _updateAll (mapper, props, query, opts) {
    props || (props = {})
    query || (query = {})
    opts || (opts = {})

    props = utils.plainCopy(props)

    const requestOpts = this.getOpt('requestOpts', opts)
    const collLink = this.getCollectionLink(mapper, opts)

    return this._findAll(mapper, query, opts)
      .then((result) => {
        const documents = result[0]
        documents.forEach((document) => {
          utils.deepMixIn(document, props)
        })
        return utils.Promise.all(documents.map((document) => {
          return new utils.Promise((resolve, reject) => {
            const docLink = `${collLink}/docs/${document.id}`
            this.client.replaceDocument(docLink, document, requestOpts, (err, updatedDocument) => {
              if (err) {
                return reject(err)
              }
              return resolve(updatedDocument)
            })
          })
        }))
      })
      .then((documents) => [documents, { updated: documents.length }])
  },

  _updateMany (mapper, records, opts) {
    records || (records = [])
    opts || (opts = {})

    records = records.filter((record) => record && record.id !== undefined)

    return utils.Promise.all(records.map((record) => this._update(mapper, record.id, record, opts)))
      .then((results) => [results.map((result) => result[0]), { updated: results.length }])
  },

  _applyWhereFromObject (where) {
    const fields = []
    const ops = []
    const predicates = []
    utils.forOwn(where, (clause, field) => {
      if (!utils.isObject(clause)) {
        clause = {
          '==': clause
        }
      }
      utils.forOwn(clause, (expr, op) => {
        fields.push(field)
        ops.push(op)
        predicates.push(expr)
      })
    })
    return {
      fields,
      ops,
      predicates
    }
  },

  _applyWhereFromArray (where) {
    const groups = []
    where.forEach((_where, i) => {
      if (utils.isString(_where)) {
        return
      }
      const prev = where[i - 1]
      const parser = utils.isArray(_where) ? this._applyWhereFromArray : this._applyWhereFromObject
      const group = parser.call(this, _where)
      if (prev === 'or') {
        group.isOr = true
      }
      groups.push(group)
    })
    groups.isArray = true
    return groups
  },

  _testObjectGroup (sql, group, parameters, collectionId, opts) {
    let i
    const fields = group.fields
    const ops = group.ops
    const predicates = group.predicates
    const len = ops.length
    for (i = 0; i < len; i++) {
      let op = ops[i]
      const isOr = op.charAt(0) === '|'
      op = isOr ? op.substr(1) : op
      const predicateFn = this.getOperator(op, opts)
      if (predicateFn) {
        const subSql = predicateFn(fields[i], predicates[i], parameters, collectionId)
        if (isOr) {
          sql = sql ? `${sql} OR (${subSql})` : `(${subSql})`
        } else {
          sql = sql ? `${sql} AND (${subSql})` : `(${subSql})`
        }
      } else {
        throw new Error(`Operator ${op} not supported!`)
      }
    }
    return sql
  },

  _testArrayGroup (sql, groups, parameters, collectionId, opts) {
    let i
    const len = groups.length
    for (i = 0; i < len; i++) {
      const group = groups[i]
      let subQuery
      if (group.isArray) {
        subQuery = this._testArrayGroup(sql, group, parameters, collectionId, opts)
      } else {
        subQuery = this._testObjectGroup(null, group, parameters, collectionId, opts)
      }
      if (groups[i - 1]) {
        if (group.isOr) {
          sql += ` OR (${subQuery})`
        } else {
          sql += ` AND (${subQuery})`
        }
      } else {
        sql = sql ? sql + ` AND (${subQuery})` : `(${subQuery})`
      }
    }
    return sql
  },

  /**
   * Generate the querySpec object for DocumentClient#queryDocuments.
   *
   * @name DocumentDBAdapter#getQuerySpec
   * @method
   * @param {object} mapper The mapper.
   * @param {object} [query] Selection query.
   * @param {object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   */
  getQuerySpec (mapper, query, opts) {
    query = utils.plainCopy(query || {})
    opts || (opts = {})
    opts.operators || (opts.operators = {})
    query.where || (query.where = {})
    query.orderBy || (query.orderBy = query.sort)
    query.orderBy || (query.orderBy = [])
    query.skip || (query.skip = query.offset)

    if (utils.isString(opts.fields)) {
      opts.fields = [opts.fields]
    }

    const collectionId = mapper.collection || underscore(mapper.name)
    let select = '*'
    let whereSql
    const parameters = []

    if (utils.isString(opts.select)) {
      select = opts.select
    } else if (utils.isArray(opts.fields)) {
      select = opts.fields.map((field) => `${collectionId}.${field}`).join(',')
    }

    let sql = `${select} FROM ${collectionId}`

    // Transform non-keyword properties to "where" clause configuration
    utils.forOwn(query, (config, keyword) => {
      if (reserved.indexOf(keyword) === -1 && utils.isObject(query.where)) {
        if (utils.isObject(config)) {
          query.where[keyword] = config
        } else {
          query.where[keyword] = {
            '==': config
          }
        }
        delete query[keyword]
      }
    })

    // Filter
    let groups

    if (utils.isObject(query.where) && Object.keys(query.where).length !== 0) {
      groups = this._applyWhereFromArray([query.where])
    } else if (utils.isArray(query.where)) {
      groups = this._applyWhereFromArray(query.where)
    }

    if (groups) {
      whereSql = this._testArrayGroup(null, groups, parameters, collectionId, opts)
    }

    if (whereSql) {
      sql = `${sql} WHERE ${whereSql}`
    }

    // Sort
    let orderBySql = ''
    if (query.orderBy) {
      if (utils.isString(query.orderBy)) {
        query.orderBy = [
          [query.orderBy, 'asc']
        ]
      }
      for (var i = 0; i < query.orderBy.length; i++) {
        if (utils.isString(query.orderBy[i])) {
          query.orderBy[i] = [query.orderBy[i], 'asc']
        }
        const subOrderBySql = (query.orderBy[i][1] || '').toUpperCase() === 'DESC' ? `${collectionId}.${query.orderBy[i][0]} DESC` : `${collectionId}.${query.orderBy[i][0]}`
        if (orderBySql) {
          orderBySql = `${orderBySql}, ${subOrderBySql}`
        } else {
          orderBySql = subOrderBySql
        }
      }
      if (orderBySql) {
        orderBySql = `ORDER BY ${orderBySql}`
      }
    }

    // Offset
    // if (query.skip) {
    //   sql += ` SKIP ${+query.skip}`
    // }

    // Limit
    if (query.limit) {
      sql = `TOP ${+query.limit} ${sql}`
    }

    sql = `SELECT ${sql}` + (orderBySql ? ` ${orderBySql}` : '')
    return {
      query: sql,
      parameters
    }
  },

  getDbLink (opts) {
    return `dbs/${opts.db === undefined ? this.documentOpts.db : opts.db}`
  },

  getCollectionLink (mapper, opts) {
    return `${this.getDbLink(opts)}/colls/${mapper.collection || underscore(mapper.name)}`
  },

  waitForDb (opts) {
    opts || (opts = {})
    const dbId = utils.isUndefined(opts.db) ? this.documentOpts.db : opts.db
    if (!this.databases[dbId]) {
      this.databases[dbId] = new utils.Promise((resolve, reject) => {
        this.client.readDatabases().toArray((err, dbs) => {
          if (err) {
            return reject(err)
          }
          let existing
          dbs.forEach((db) => {
            if (dbId === db.id) {
              existing = db
              return false
            }
          })
          if (!existing) {
            return this.client.createDatabase({ id: dbId }, (err, db) => {
              if (err) {
                return reject(err)
              }
              return resolve(db)
            })
          }
          return resolve(existing)
        })
      })
    }
    return this.databases[dbId]
  },

  waitForCollection (mapper, opts) {
    opts || (opts = {})
    const collectionId = utils.isString(mapper) ? mapper : (mapper.collection || underscore(mapper.name))
    let dbId = utils.isUndefined(opts.db) ? this.documentOpts.db : opts.db
    return this.waitForDb(opts).then(() => {
      this.collections[dbId] = this.collections[dbId] || {}
      if (!this.collections[dbId][collectionId]) {
        this.collections[dbId][collectionId] = new utils.Promise((resolve, reject) => {
          this.client.readCollections(`dbs/${dbId}`).toArray((err, collections) => {
            if (err) {
              return reject(err)
            }
            let existing
            collections.forEach((collection) => {
              if (collectionId === collection.id) {
                existing = collection
                return false
              }
            })
            if (!existing) {
              return this.client.createCollection(`dbs/${dbId}`, { id: collectionId }, (err, collection) => {
                if (err) {
                  return reject(err)
                }
                return resolve(collection)
              })
            }
            return resolve(existing)
          })
        })
      }
      return this.collections[dbId][collectionId]
    })
  },

  /**
   * Return the number of records that match the selection query.
   *
   * @name DocumentDBAdapter#count
   * @method
   * @param {object} mapper the mapper.
   * @param {object} [query] Selection query.
   * @param {object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  count (mapper, query, opts) {
    opts || (opts = {})
    query || (query = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.count.call(this, mapper, query, opts))
  },

  /**
   * Create a new record.
   *
   * @name DocumentDBAdapter#create
   * @method
   * @param {object} mapper The mapper.
   * @param {object} props The record to be created.
   * @param {object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  create (mapper, props, opts) {
    props || (props = {})
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.create.call(this, mapper, props, opts))
  },

  /**
   * Create multiple records in a single batch.
   *
   * @name DocumentDBAdapter#createMany
   * @method
   * @param {object} mapper The mapper.
   * @param {object} props The records to be created.
   * @param {object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  createMany (mapper, props, opts) {
    props || (props = {})
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.createMany.call(this, mapper, props, opts))
  },

  /**
   * Destroy the record with the given primary key.
   *
   * @name DocumentDBAdapter#destroy
   * @method
   * @param {object} mapper The mapper.
   * @param {(string|number)} id Primary key of the record to destroy.
   * @param {object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  destroy (mapper, id, opts) {
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.destroy.call(this, mapper, id, opts))
  },

  /**
   * Destroy the records that match the selection query.
   *
   * @name DocumentDBAdapter#destroyAll
   * @method
   * @param {object} mapper the mapper.
   * @param {object} [query] Selection query.
   * @param {object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.feedOpts] Options to pass to the DocumentClient#queryDocuments.
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  destroyAll (mapper, query, opts) {
    opts || (opts = {})
    query || (query = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.destroyAll.call(this, mapper, query, opts))
  },

  /**
   * Retrieve the record with the given primary key.
   *
   * @name DocumentDBAdapter#find
   * @method
   * @param {object} mapper The mapper.
   * @param {(string|number)} id Primary key of the record to retrieve.
   * @param {object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @param {string[]} [opts.with=[]] Relations to eager load.
   * @return {Promise}
   */
  find (mapper, id, opts) {
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.find.call(this, mapper, id, opts))
  },

  /**
   * Retrieve the records that match the selection query.
   *
   * @name DocumentDBAdapter#findAll
   * @method
   * @param {object} mapper The mapper.
   * @param {object} [query] Selection query.
   * @param {object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.feedOpts] Options to pass to the DocumentClient#queryDocuments.
   * @param {string[]} [opts.fields] Choose which fields should be returned from
   * the SQL query, e.g. ["id", "name"].
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @param {string} [opts.select] Override the SELECT string in the resulting
   * SQL query, e.g. "users.id,users.name".
   * @param {string[]} [opts.with=[]] Relations to eager load.
   * @return {Promise}
   */
  findAll (mapper, query, opts) {
    opts || (opts = {})
    query || (query = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.findAll.call(this, mapper, query, opts))
  },

  /**
   * Resolve the predicate function for the specified operator based on the
   * given options and this adapter's settings.
   *
   * @name DocumentDBAdapter#getOperator
   * @method
   * @param {string} operator The name of the operator.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @return {*} The predicate function for the specified operator.
   */
  getOperator (operator, opts) {
    opts || (opts = {})
    opts.operators || (opts.operators = {})
    let ownOps = this.operators || {}
    return utils.isUndefined(opts.operators[operator]) ? ownOps[operator] : opts.operators[operator]
  },

  /**
   * Return the sum of the specified field of records that match the selection
   * query.
   *
   * @name DocumentDBAdapter#sum
   * @method
   * @param {object} mapper The mapper.
   * @param {string} field The field to sum.
   * @param {object} [query] Selection query.
   * @param {object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.feedOpts] Options to pass to the DocumentClient#queryDocuments.
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  sum (mapper, field, query, opts) {
    opts || (opts = {})
    query || (query = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.sum.call(this, mapper, field, query, opts))
  },

  /**
   * Apply the given update to the record with the specified primary key.
   *
   * @name DocumentDBAdapter#update
   * @method
   * @param {object} mapper The mapper.
   * @param {(string|number)} id The primary key of the record to be updated.
   * @param {object} props The update to apply to the record.
   * @param {object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  update (mapper, id, props, opts) {
    props || (props = {})
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.update.call(this, mapper, id, props, opts))
  },

  /**
   * Apply the given update to all records that match the selection query.
   *
   * @name DocumentDBAdapter#updateAll
   * @method
   * @param {object} mapper The mapper.
   * @param {object} props The update to apply to the selected records.
   * @param {object} [query] Selection query.
   * @param {object} [query.where] Filtering criteria.
   * @param {string|Array} [query.orderBy] Sorting criteria.
   * @param {string|Array} [query.sort] Same as `query.sort`.
   * @param {number} [query.limit] Limit results.
   * @param {number} [query.skip] Offset results.
   * @param {number} [query.offset] Same as `query.skip`.
   * @param {object} [opts] Configuration options.
   * @param {object} [opts.feedOpts] Options to pass to the DocumentClient#queryDocuments.
   * @param {object} [opts.operators] Override the default predicate functions
   * for specified operators.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  updateAll (mapper, props, query, opts) {
    props || (props = {})
    query || (query = {})
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.updateAll.call(this, mapper, props, query, opts))
  },

  /**
   * Update the given records in a single batch.
   *
   * @name DocumentDBAdapter#updateMany
   * @method
   * @param {object} mapper The mapper.
   * @param {Object[]} records The records to update.
   * @param {object} [opts] Configuration options.
   * @param {boolean} [opts.raw=false] Whether to return a more detailed
   * response object.
   * @param {object} [opts.requestOpts] Options to pass to the DocumentClient request.
   * @return {Promise}
   */
  updateMany (mapper, records, opts) {
    records || (records = [])
    opts || (opts = {})

    return this.waitForCollection(mapper, opts)
      .then(() => Adapter.prototype.updateMany.call(this, mapper, records, opts))
  }
})

/**
 * Details of the current version of the `js-data-documentdb` module.
 *
 * @example <caption>ES2015 modules import</caption>
 * import {version} from 'js-data-documentdb'
 * console.log(version.full)
 *
 * @example <caption>CommonJS import</caption>
 * var version = require('js-data-documentdb').version
 * console.log(version.full)
 *
 * @name module:js-data-documentdb.version
 * @type {object}
 * @property {string} version.full The full semver value.
 * @property {number} version.major The major version number.
 * @property {number} version.minor The minor version number.
 * @property {number} version.patch The patch version number.
 * @property {(string|boolean)} version.alpha The alpha version value,
 * otherwise `false` if the current version is not alpha.
 * @property {(string|boolean)} version.beta The beta version value,
 * otherwise `false` if the current version is not beta.
 */
export const version = '<%= version %>'

/**
 * {@link DocumentDBAdapter} class.
 *
 * @example <caption>ES2015 modules import</caption>
 * import {DocumentDBAdapter} from 'js-data-documentdb'
 * const adapter = new DocumentDBAdapter()
 *
 * @example <caption>CommonJS import</caption>
 * var DocumentDBAdapter = require('js-data-documentdb').DocumentDBAdapter
 * var adapter = new DocumentDBAdapter()
 *
 * @name module:js-data-documentdb.DocumentDBAdapter
 * @see DocumentDBAdapter
 * @type {Constructor}
 */

/**
 * Registered as `js-data-documentdb` in NPM.
 *
 * @example <caption>Install from NPM</caption>
 * npm i --save js-data-documentdb js-data documentdb
 *
 * @example <caption>ES2015 modules import</caption>
 * import { DocumentDBAdapter } from 'js-data-documentdb'
 * const adapter = new DocumentDBAdapter({
 *   documentOpts: {
 *     db: 'mydb',
 *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
 *     auth: {
 *       masterKey: process.env.DOCUMENT_DB_KEY
 *     }
 *   }
 * })
 *
 * @example <caption>CommonJS import</caption>
 * var DocumentDBAdapter = require('js-data-documentdb').DocumentDBAdapter
 * var adapter = new DocumentDBAdapter({
 *   documentOpts: {
 *     db: 'mydb',
 *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
 *     auth: {
 *       masterKey: process.env.DOCUMENT_DB_KEY
 *     }
 *   }
 * })
 *
 * @module js-data-documentdb
 */

/**
 * Create a subclass of this DocumentDBAdapter:
 * @example <caption>DocumentDBAdapter.extend</caption>
 * // Normally you would do: import {DocumentDBAdapter} from 'js-data-documentdb'
 * const JSDataDocumentDB = require('js-data-documentdb')
 * const { DocumentDBAdapter } = JSDataDocumentDB
 * console.log('Using JSDataDocumentDB v' + JSDataDocumentDB.version.full)
 *
 * // Extend the class using ES2015 class syntax.
 * class CustomDocumentDBAdapterClass extends DocumentDBAdapter {
 *   foo () { return 'bar' }
 *   static beep () { return 'boop' }
 * }
 * const customDocumentDBAdapter = new CustomDocumentDBAdapterClass({
 *   documentOpts: {
 *     db: 'mydb',
 *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
 *     auth: {
 *       masterKey: process.env.DOCUMENT_DB_KEY
 *     }
 *   }
 * })
 * console.log(customDocumentDBAdapter.foo())
 * console.log(CustomDocumentDBAdapterClass.beep())
 *
 * // Extend the class using alternate method.
 * const OtherDocumentDBAdapterClass = DocumentDBAdapter.extend({
 *   foo () { return 'bar' }
 * }, {
 *   beep () { return 'boop' }
 * })
 * const otherDocumentDBAdapter = new OtherDocumentDBAdapterClass({
 *   documentOpts: {
 *     db: 'mydb',
 *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
 *     auth: {
 *       masterKey: process.env.DOCUMENT_DB_KEY
 *     }
 *   }
 * })
 * console.log(otherDocumentDBAdapter.foo())
 * console.log(OtherDocumentDBAdapterClass.beep())
 *
 * // Extend the class, providing a custom constructor.
 * function AnotherDocumentDBAdapterClass () {
 *   DocumentDBAdapter.call(this)
 *   this.created_at = new Date().getTime()
 * }
 * DocumentDBAdapter.extend({
 *   constructor: AnotherDocumentDBAdapterClass,
 *   foo () { return 'bar' }
 * }, {
 *   beep () { return 'boop' }
 * })
 * const anotherDocumentDBAdapter = new AnotherDocumentDBAdapterClass({
 *   documentOpts: {
 *     db: 'mydb',
 *     urlConnection: process.env.DOCUMENT_DB_ENDPOINT,
 *     auth: {
 *       masterKey: process.env.DOCUMENT_DB_KEY
 *     }
 *   }
 * })
 * console.log(anotherDocumentDBAdapter.created_at)
 * console.log(anotherDocumentDBAdapter.foo())
 * console.log(AnotherDocumentDBAdapterClass.beep())
 *
 * @method DocumentDBAdapter.extend
 * @param {object} [props={}] Properties to add to the prototype of the
 * subclass.
 * @param {object} [props.constructor] Provide a custom constructor function
 * to be used as the subclass itself.
 * @param {object} [classProps={}] Static properties to add to the subclass.
 * @returns {Constructor} Subclass of this DocumentDBAdapter class.
 * @since 3.0.0
 */
