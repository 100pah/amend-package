const nodePath = require('node:path');
const nodeFS = require('node:fs');
const assert = require('node:assert');
const {parseArgs, promisify} = require('node:util');
const {exec} = require('node:child_process');
const nodeFSStat = promisify(nodeFS.stat);
const nodeFSWriteFile = promisify(nodeFS.writeFile);

/**
 * @typedef {string} PackageName
 *
 * @typedef {(key: string, value: unknown) => void} SetPackageJSONAttr
 *  Modify pacakge.json top-level key-value pair.
 *  key: package.json top-level key.
 *  value: package.json top-level value.
 *
 * @typedef {(key: string) => unknown} GetPackageJSONAttrClone
 *  Return a clone of the value of the specified key in package.json.
 *  Only provide a clone to enforce that the modification is only via setPackageJSONAttr.
 *
 * @typedef {(subAmender: AmendSubPackage) => void} EnsureSubPackageJSON
 *  Create or update a package.json in a specified directory.
 *
 * @typedef {() => string} GetPackageVersion
 *  Get the version property of the package.json. If not exists, return undefined.
 *
 * @typedef {(
 *  setPackageJSONAttr: SetPackageJSONAttr,
 *  ensureSubPackageJSON: EnsureSubPackageJSON,
 *  getPackageJSONAttrClone: getPackageJSONAttrClone,
 *  getPackageVersion: GetPackageVersion,
 * ) => void} AmendSinglePackage
 *
 * @typedef {(
 *  setPackageJSONAttr: SetPackageJSONAttr,
 *  ensureSubPackageJSON: EnsureSubPackageJSON,
 *  getPackageJSONAttrClone: getPackageJSONAttrClone,
 *  getPackageVersion: GetPackageVersion,
 * ) => void} AmendSubPackage
 *
 * @typedef {Record<PackageName, AmendSinglePackage>} PackageAmenderMap
 *
 * @typedef {{amenderMap: PackageAmenderMap}} AmendPackageConfig
 *
 * This is the posix style path string, relative to the package root directory.
 * e.g., "package.json", "xxx/package.json".
 * @typedef {string} SubPathString
 *
 * @typedef {"__amend_package__not_exist_originally__"} NotExistOriginally
 *
 * The ReverterHostRecord is like:
 *  {
 *    "package.json": { // for record of ./package.json
 *      "type": "module", // original value
 *      "exports": "__amend_package__not_exist_originally__" // means not exists originally
 *    },
 *    "dist/package.json": { // for record of ./dist/package.json
 *      "type": "commonjs", // original value
 *    },
 *    "build/package.json": "__amend_package__not_exist_originally__" // means not exists originally
 *  }
 * @typedef {Record<
 *    SubPathString,
 *    Record<string, object | NotExistOriginally> | NotExistOriginally
 *  >>} ReverterHostRecord
 */


const PACKAGE_JSON_REVERTER_HOST_RECORD_KEY = '__amend_package__reverter_host_record__';
const NOT_EXIST_ORIGINALLY = '__amend_package__not_exist_originally__';


function createHelpMessage() {
  return `
    [Usage]:

      # Print help
      npx amend-package --help

      # Modify all packages.
      npx amend-package --config amend-package.config.cjs

      # Modify all packages, but try run without real modification.
      npx amend-package --config amend-package.config.cjs --dry-run

      # Modify the specified package.
      npx amend-package --config amend-package.config.cjs --package some_pkg_name
      # Revert the modifications to all packages.
      npx amend-package --config amend-package.config.cjs --revert

      # Revert the modifications to the specified package.
      npx amend-package --config amend-package.config.cjs --revert --package some_pkg_name


    [Options]:

      --help
        Print help.

      --config
        Specify the config file path.
        At present only CommonJS is supported in the config file.
        The config file is loaded via
          const config = require(require('node:path').resolve(cmdInputConfigPath)).
        See the example config files in "amend-package/builtin-config/*.config.cjs".
        Either --builtin-config or --config must be specified.

      --builtin-config
        Specify the config file name.
        e.g. --builtin-config fix-vue-echarts-esm.config.cjs
        Either --builtin-config or --config must be specified.

      --list-builtin-config
        List built-in config files.

      --dry-run
        Just log what will be changed but do not change anything.

      --package <package_name>
        Specify the package (npm package name) to modify.
        If not specified, modify all packages.
        e.g. --package some_pkg_name

      --revert
        Revert the modifications.

      --builtin-case
        List built-in cases.

      --case <case_name>
        Specify a case to run.
        If not specified, run all cases.


    [Example of amend-package.config.cjs]:

      module.exports = {
        amenderMap: {

          'some_package_1': ({
            setPackageJSONAttr,
            ensureSubPackageJSON,
            getPackageJSONAttrClone,
            getPackageVersion
          }) => {
            const currentVersion = getPackageVersion();
            const expectedVersion = '5.1.2';
            if (currentVersion !== expectedVersion) {
              throw new Error(
                'Please check the patch logic when upgrade "some_package_1".'
                + ' currentVersion: ' + currentVersion
                + ' expectedVersion: ' + expectedVersion
              );
            }
            setPackageJSONAttr('type', 'module');
            setPackageJSONAttr('exports', {
              ".": {
                  "types": "./index.d.ts",
                  "require": "./dist/zrender.js",
                  "import": "./index.js"
              },
              "./*": "./*",
            });
            ensureSubPackageJSON(['dist'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
            ensureSubPackageJSON(['build'], ({setPackageJSONAttr}) => setPackageJSONAttr('type', 'commonjs'));
          },

          'some_package_2': ({
            setPackageJSONAttr,
            ensureSubPackageJSON,
            getPackageJSONAttrClone,
            getPackageVersion
          }) => {
            // ...
          },
          // ...

        },
      };

    `;
}

function cmdInline(cmdStr) {
  return new Promise((resolve, reject) => {
    console.log(`[cmd_exec_inline]: ${cmdStr}`);
    exec(cmdStr, {}, (error, stdout) => {
      if (error) {
        console.log(`[cmd_exec_failed] exit code: ${error.code}, signal: ${error.signal}`);
        reject(error);
      }
      resolve(`${stdout}`);
    });
  });
};

function isObject(val) {
  return typeof val === 'object' && val !== null;
}

function errorExit(msg) {
  throw new Error(`${msg}  Check --help for usage.`);
}

async function fileExistsAsync(...pathParts) {
  return (...p) => nodeFSStat(nodePath.resolve(...pathParts))
    .then((st) => st.isFile())
    .catch(() => false);
}

async function dirExistsAsync(...pathParts) {
  return (...p) => nodeFSStat(nodePath.resolve(...pathParts))
    .then((st) => st.isDirectory())
    .catch(() => false);
}

async function fetchPkgDirList(packageName) {
  const depDirOutput = await cmdInline(
    // Works for npm and yarn1.x and pnpm.
    // All of the absolute paths of the package will be listed,
    // if there are multiple versions of the package.
    `npm ls --parseable ${packageName}`
  );
  return depDirOutput.split(/[\n\r]+/).filter(depDir => depDir);
}

// async function getLocalPackageLookupPaths() {
//   // @see node-18.18.0/deps/npm/node_modules/@npmcli/config/lib/index.js
//   let targetDir = process.cwd();

//   // Do not walk up to ancestor diretory and do not look up global packages for safety.
//   // Global packages should better not be modified.
//   if (await dirExistsAsync(targetDir, 'node_modules')) {
//     return [targetDir];
//   }
//   errorExit(`
//     node_modules is not found in the current working path "${targetDir}".
//     amend-package can only be executed in the project root path and after node_modules installed.
//   `);
// }

function getLogTag(revert, isDryRun) {
  const msg = revert ? '[revert]' : '[patch]';
  return isDryRun ? `[dry-run] ${msg} ` : msg;
}

function loggableJSONValue(value) {
  if (value === undefined) {
    return 'undefined';
  }
  let str = JSON.stringify(value, null, 0);
  if (str.length > 50) {
    str = str.slice(0, 50) + ' ...';
  }
  return str;
}


/**
 * User input subPath is like: [], ['dist'], ['src', 'util']
 */
function initSubPathWrapper(_pkgDirPath) {
  assert(_pkgDirPath);
  let _arrayPath = null;
  let _isDir = null; // false: is file.

  function validateArrayPath(subPath) {
    if (!Array.isArray(subPath)) {
      errorExit("subPath should be an array like [], ['dist'], ['src', 'util']");
    }
  }

  const wrapper = {
    // If fileName is not specified, means the subPath is a directory.
    resetFromArrayPath(subDirArrayPath, fileName) {
      validateArrayPath(subDirArrayPath);
      _arrayPath = subDirArrayPath.slice();
      _isDir = fileName == null;
      if (fileName != null) {
        _arrayPath.push(fileName);
      }
      return wrapper;
    },

    /**
     * @param {SubPathString} strKey
     */
    resetFromStringKey(strKey) {
      _arrayPath = strKey.split(nodePath.posix.sep);
      return wrapper;
    },

    isRootSubPath() {
      const len = _arrayPath.length;
      return _isDir ? len === 0 : len === 1;
    },

    getAbsolutePath() {
      return nodePath.join(_pkgDirPath, ..._arrayPath);
    },

    /**
     * @return {SubPathString}
     */
    makeStringKey() {
      return _arrayPath.join(nodePath.posix.sep);
    },
  }
  return wrapper;
} // initSubPathWrapper end


/**
 * The revertRecord structure is like:
 *  {
 *    "": { // for record of ./package.json
 *      "type": "module", // original value
 *      "exports": "__amend_package__not_exist_originally__" // means not exists originally
 *    },
 *    "dist": { // for record of ./dist/package.json
 *      "type": "commonjs", // original value
 *    },
 *    "src/util": { // for record of ./src/util/package.json
 *    },
 *    "build": "__amend_package__not_exist_originally__" // means not exists originally
 *  }
 */
function initReverter(_rootPkgJSON, _pkgDirPath) {
  assert(_rootPkgJSON);
  assert(_pkgDirPath);

  function slowCloneJSON(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * @return {ReverterHostRecord}
   */
  function ensureHostRecord() {
    if (!_rootPkgJSON[PACKAGE_JSON_REVERTER_HOST_RECORD_KEY]) {
      _rootPkgJSON[PACKAGE_JSON_REVERTER_HOST_RECORD_KEY] = {};
    }
    // else already recorded, do not earse, consider patch twice.
    return _rootPkgJSON[PACKAGE_JSON_REVERTER_HOST_RECORD_KEY];
  }

  return {

    initReverterPart({subPathWrapper, notExistOriginally}) {
      assert(subPathWrapper);
      assert(notExistOriginally != null);

      const hostRecord = ensureHostRecord();
      const revertRecordPartKey = subPathWrapper.makeStringKey();
      let part = hostRecord[revertRecordPartKey];
      if (!hostRecord.hasOwnProperty(revertRecordPartKey)) {
        part = hostRecord[revertRecordPartKey] = notExistOriginally ? NOT_EXIST_ORIGINALLY : {};
      }
      // else already recorded, do not earse, consider patch twice.

      return {
        recordUpdateOnKey(targetPkgJSON, key) {
          assert(targetPkgJSON);
          assert(key != null);

          if (part === NOT_EXIST_ORIGINALLY) {
            return;
          }
          if (part.hasOwnProperty(key)) {
            // already recorded, do not earse, consider patch twice.
            return;
          }
          const oldValue = targetPkgJSON[key];
          part[key] = oldValue === undefined
            ? NOT_EXIST_ORIGINALLY
            : slowCloneJSON(oldValue);
        },
      };
    },

    performRevert({onDeleteFile, onUpdatePkgJSON}) {
      const hostRecord = _rootPkgJSON[PACKAGE_JSON_REVERTER_HOST_RECORD_KEY];
      if (!hostRecord) {
        return;
      }
      delete _rootPkgJSON[PACKAGE_JSON_REVERTER_HOST_RECORD_KEY];

      for (const partKey of Object.keys(hostRecord)) {
        const part = hostRecord[partKey];
        const subPathWrapper = initSubPathWrapper(_pkgDirPath).resetFromStringKey(partKey);
        if (part === NOT_EXIST_ORIGINALLY) {
          onDeleteFile(subPathWrapper);
        }
        else {
          onUpdatePkgJSON(subPathWrapper, ({onDeleteKV, onRevertKV}) => {
            for (const key of Object.keys(part)) {
              const originalValue = part[key];
              if (originalValue === NOT_EXIST_ORIGINALLY) {
                onDeleteKV(key);
              }
              else {
                onRevertKV(key, originalValue);
              }
            }
          });
        }
      }
    },

  };
} // initReverter end


async function revertSinglePackage(logTag, pkgName, pkgDirPath, committer) {
  const {rootPkgJSON, rootPkgJSONPath} = await preparePackageInfo(pkgDirPath);
  console.log(`${logTag} will_update: ${rootPkgJSONPath}`);

  const reverter = initReverter(rootPkgJSON, pkgDirPath);
  reverter.performRevert({

    onDeleteFile(subPathWrapper) {
      const filePathStr = subPathWrapper.getAbsolutePath();
      console.log(`${logTag} will_delete: ${filePathStr}`);
      committer.deleteFile(filePathStr, logTag);
    },

    onUpdatePkgJSON(subPathWrapper, eachUpdatedKV) {
      let pkgJSON;
      let filePathStr;
      if (subPathWrapper.isRootSubPath()) {
        filePathStr = rootPkgJSONPath;
        pkgJSON = rootPkgJSON;
      }
      else {
        filePathStr = subPathWrapper.getAbsolutePath();
        pkgJSON = require(filePathStr);
      }
      eachUpdatedKV({
        onDeleteKV(key) {
          delete pkgJSON[key];
          console.log(`${logTag} delete_attr: "${key}"`);
        },
        onRevertKV(key, originalValue) {
          pkgJSON[key] = originalValue;
          console.log(`${logTag} set_attr: "${key}": ${loggableJSONValue(originalValue)}`);
        }
      });
      committer.writeJSONFile(filePathStr, pkgJSON, logTag);
    }
  });
}

/**
 * @public
 * @type {SetPackageJSONAttr}
 */
function setPackageJSONAttr(
  // @private [Function.bind args]:
  logTag, reverterPart, targetPkgJSON,
  // @public [User input args]:
  key, value
) {
  reverterPart.recordUpdateOnKey(targetPkgJSON, key);
  targetPkgJSON[key] = value;
  console.log(`${logTag} set_attr: "${key}": ${loggableJSONValue(value)}`);
}

/**
 * @public
 * @type {GetPackageJSONAttrClone}
 */
function getPackageJSONAttrClone(
  // @private [Function.bind args]:
  targetPkgJSON,
  // @public [User input args]:
  key
) {
  const value = targetPkgJSON[key];
  // value is json serializable, and performance is not an issue.
  return value != null ? JSON.parse(JSON.stringify(value)) : value;
}

/**
 * @public
 * @type {EnsureSubPackageJSON}
 */
function ensureSubPackageJSON(
  // @private [Function.bind args]:
  logTag, pkgDirPath, reverter, committer, subDirArrayPath,
  // @public [User input args]:
  subAmender
) {
  const dirSubPathWrapper = initSubPathWrapper(pkgDirPath).resetFromArrayPath(subDirArrayPath);
  const dirSubAbsolutePath = dirSubPathWrapper.getAbsolutePath();
  assert(
    nodeFS.existsSync(dirSubAbsolutePath),
    `${logTag} [ensureSubPackageJSON] ${dirSubAbsolutePath} not exists.`
  );
  assert(
    nodeFS.statSync(dirSubAbsolutePath).isDirectory(),
    `${logTag} [ensureSubPackageJSON] ${dirSubAbsolutePath} is not a directory.`
  );
  const pgkJSONSubPathWrapper = initSubPathWrapper(pkgDirPath).resetFromArrayPath(subDirArrayPath, 'package.json');
  const pkgJSONSubAbsolutePath = pgkJSONSubPathWrapper.getAbsolutePath();
  const isSubPkgJSONExist = nodeFS.existsSync(pkgJSONSubAbsolutePath);

  let subPkgJSON;
  let reverterSubPart;
  let commitMsg;
  if (isSubPkgJSONExist) {
    console.log(`${logTag} will_update: ${pkgJSONSubAbsolutePath}`);
    commitMsg = `${logTag} (update)`;
    subPkgJSON = require(pkgJSONSubAbsolutePath);
    reverterSubPart = reverter.initReverterPart({
      subPathWrapper: pgkJSONSubPathWrapper,
      notExistOriginally: false
    });
  }
  else {
    console.log(`${logTag} will_create: ${pkgJSONSubAbsolutePath}`);
    commitMsg = `${logTag} (create)`;
    subPkgJSON = {};
    reverterSubPart = reverter.initReverterPart({
      subPathWrapper: pgkJSONSubPathWrapper,
      notExistOriginally: true
    });
  }

  subAmender({
    setPackageJSONAttr: setPackageJSONAttr.bind(null, logTag, reverterSubPart, subPkgJSON),
    getPackageJSONAttrClone: getPackageJSONAttrClone.bind(null, subPkgJSON),
    getPackageVersion: getPackageVersion.bind(null, subPkgJSON),
  });

  committer.writeJSONFile(pkgJSONSubAbsolutePath, subPkgJSON, commitMsg);
}

/**
 * @public
 * @type {GetPackageVersion}
 */
function getPackageVersion(
  // @private [Function.bind args]:
  pkgJSON,
) {
  return pkgJSON.version;
}

async function amendSinglePackage(logTag, pkgName, pkgDirPath, committer, amenderMap) {
  const {rootPkgJSON, rootPkgJSONPath} = await preparePackageInfo(pkgDirPath);
  console.log(`${logTag} will_update: ${rootPkgJSONPath}`);

  const reverter = initReverter(rootPkgJSON, pkgDirPath);
  const reverterRootPart = reverter.initReverterPart({
    subPathWrapper: initSubPathWrapper(pkgDirPath).resetFromArrayPath([], 'package.json'),
    notExistOriginally: false
  });

  amenderMap[pkgName]({
    setPackageJSONAttr: setPackageJSONAttr.bind(null, logTag, reverterRootPart, rootPkgJSON),
    ensureSubPackageJSON: ensureSubPackageJSON.bind(null, logTag, pkgDirPath, reverter, committer),
    getPackageJSONAttrClone: getPackageJSONAttrClone.bind(null, rootPkgJSON),
    getPackageVersion: getPackageVersion.bind(null, rootPkgJSON),
  });

  committer.writeJSONFile(rootPkgJSONPath, rootPkgJSON, `${logTag} update`);
}

async function preparePackageInfo(pkgDirPath) {
  assert(pkgDirPath);
  assert(await dirExistsAsync(pkgDirPath));

  const rootPkgJSONPath = nodePath.join(pkgDirPath, 'package.json');
  const rootPkgJSON = require(rootPkgJSONPath);

  return {rootPkgJSON, rootPkgJSONPath};
}

async function dealSinglePackage(amenderMap, pkgName, revert, committer, isDryRun) {
  const pkgDirList = await fetchPkgDirList(pkgName);

  for (const pkgDirPath of pkgDirList) {
    const logTag = getLogTag(revert, isDryRun);

    if (revert) {
      await revertSinglePackage(logTag, pkgName, pkgDirPath, committer);
    }
    else {
      await amendSinglePackage(logTag, pkgName, pkgDirPath, committer, amenderMap);
    }
  }
}


function createCommitter(commitList, isDryRun) {
  return {
    deleteFile: function (filePath, extraMsg) {
      commitList.push(async () => {
        if (await fileExistsAsync(filePath)) {
          console.log(`${extraMsg} deleting file: ${filePath}`);
          if (!isDryRun) {
            nodeFS.unlinkSync(filePath);
          }
        }
      });
    },
    writeJSONFile: function (filePath, jsonObj, extraMsg) {
      commitList.push(async () => {
        console.log(`${extraMsg} writing file: ${filePath}`);
        if (!isDryRun) {
          const content = JSON.stringify(jsonObj, null, 2);
          await nodeFSWriteFile(filePath, content);
        }
      });
    }
  };
}

/**
 * @param {AmendPackageConfig} config
 * @param {PackageName} cliPkgName
 * @param {boolean} revert
 * @param {boolean} isDryRun
 */
async function performAmend(config, cliPkgName, revert, isDryRun) {
  if (!isObject(config.amenderMap) || Object.keys(config.amenderMap).length === 0) {
    errorExit('No package amender registered. Check --help for usage.');
  }
  const amenderMap = Object.assign({}, config.amenderMap);

  const pkgNameList = [];
  if (cliPkgName) {
    if (!amenderMap[cliPkgName]) {
      errorExit(`Unknown package: ${cliPkgName}`);
    }
    pkgNameList.push(cliPkgName);
  }
  else {
    pkgNameList.push(...Object.keys(amenderMap));
  }

  console.log(`[target_packages]: ${pkgNameList.join(', ')}`);

  // Collect commits and execute at last. Just try to prevent from
  // crashing after half-way modification by some unexpected assertion fail.
  // (Assume that commits is not too much to cause big memory usage).
  const commitList = [];
  const committer = createCommitter(commitList, isDryRun);

  // modify
  await Promise.all(pkgNameList.map(
    pkgName => dealSinglePackage(amenderMap, pkgName, revert, committer, isDryRun)
  ));

  // commit
  if (commitList.length) {
    console.log('Writing ...');
    await Promise.all(commitList.map(async commit => await commit()));
    console.log('Write done.');
  }
  else {
    console.log(
      'Nothing to modify. Please check that whether the config is correct, or whether packages are installed.'
    );
  }
}

function printHelp() {
  console.log(createHelpMessage());
}

/**
 * @return {AmendPackageConfig}
 */
function loadConfig({configPath, isBuiltinConfig}) {
  let config;
  let resolvedConfigPath;
  if (isBuiltinConfig) {
    resolvedConfigPath = nodePath.resolve(nodePath.join(__dirname, '..', 'builtin-config', configPath));
  }
  else {
    resolvedConfigPath = nodePath.resolve(configPath);
  }
  config = require(resolvedConfigPath);

  if (!isObject(config)) {
    errorExit(`must export an object in config file, but got ${typeof config}`);
  }

  return Object.assign({}, config);
}

function listBuiltinConfig() {
  const builtinConfigDir = nodePath.join(__dirname, '..', 'builtin-config');
  const paths = nodeFS.readdirSync(builtinConfigDir);
  if (paths.length) {
    console.log('Built-in config file names:');
    console.log();
    paths.forEach(function(path) {
      console.log('  ' + path);
    });
    console.log();
    console.log('Use --builtin-config <config_file_name> to use one of them.');
    console.log();
  }
  else {
    console.log('No built-in config files.');
  }
}

/**
 * @public
 * @param {string[]} args process.argv
 */
exports.runCLI = async function (args) {

  const argOptions = {
    'help': {type: 'boolean'},
    'config': {type: 'string'},
    'builtin-config': {type: 'string'},
    'list-builtin-config': {type: 'string'},
    'revert': {type: 'boolean'},
    'reverse': {type: 'boolean'},
    'restore': {type: 'boolean'},
    'package': {type: 'string', default: ''},
    'dry-run': {type: 'boolean'},
  };
  const {values} = parseArgs({options: argOptions, args: args, strict: false});

  if (values.help) {
    printHelp();
  }
  else if (values['list-builtin-config']) {
    listBuiltinConfig();
  }
  else {
    const cliPkgName = values.package;
    const revert = values.revert || values.reverse || values.restore;
    const isDryRun = values['dry-run'];

    let config = null;
    if (values['builtin-config']) {
      config = loadConfig({configPath: values['builtin-config'], isBuiltinConfig: true});
    }
    else if (values.config) {
      config = loadConfig({configPath: values.config, isBuiltinConfig: false});
    }
    else {
      errorExit('Either --builtin-config or --config must be specified.');
    }

    await performAmend(config, cliPkgName, revert, isDryRun);
  }
};
