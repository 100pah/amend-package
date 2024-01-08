const nodePath = require('node:path');
const nodeFS = require('node:fs');
const assert = require('node:assert');
const {parseArgs} = require('node:util');
const {exec} = require('node:child_process');

/**
 * @typedef {string} PackageName
 *
 * @typedef {(key: string, value: unknown) => void} SetPkgJSONAttr
 *  Modify pacakge.json top-level key-value pair.
 *  key: package.json top-level key.
 *  value: package.json top-level value.
 *
 * @typedef {(subAmender: AmendSub) => void} EnsureSubPkgJSON
 *  Create or update a package.json in a specified directory.
 *
 * @typedef {(setPkgJSONAttr: SetPkgJSONAttr) => void} AmendSub
 *
 * @typedef {(setPkgJSONAttr: SetPkgJSONAttr, ensureSubPkgJSON: EnsureSubPkgJSON) => void} AmendSinglePacakge
 *
 * @typedef {Record<PackageName, AmendSinglePacakge>} PackageAmenderMap
 *
 * @typedef {{amenderMap: PackageAmenderMap}} AmendPackageConfig
 */


const PACKAGE_JSON_REVERT_RECORD_KEY = '__ec_package_patch_revert_record__';
const JSON_NOT_EXIST_ORIGINALLY = '__ec_package_patch_json_not_exist_originally__';


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
          'some_package_1': ({setPkgJSONAttr, ensureSubPkgJSON}) => {
            setPkgJSONAttr('type', 'module');
            setPkgJSONAttr('exports', {
              ".": {
                  "types": "./index.d.ts",
                  "require": "./dist/zrender.js",
                  "import": "./index.js"
              },
              "./*": "./*",
            });
            ensureSubPkgJSON(['dist'], ({setPkgJSONAttr}) => setPkgJSONAttr('type', 'commonjs'));
            ensureSubPkgJSON(['build'], ({setPkgJSONAttr}) => setPkgJSONAttr('type', 'commonjs'));
          },
          'some_package_2': ({setPkgJSONAttr, ensureSubPkgJSON}) => {
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

async function fetchPkgDirList(packageName) {
  const depDirOutput = await cmdInline(
    `npm ls --parseable ${packageName}`
  );
  return depDirOutput.split(/[\n\r]+/).filter(depDir => depDir);
}

function getMsgTag(revert, isDryRun) {
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
 *      "exports": "__ec_package_patch_json_not_exist_originally__" // means not exists originally
 *    },
 *    "dist": { // for record of ./dist/package.json
 *      "type": "commonjs", // original value
 *    },
 *    "src/util": { // for record of ./src/util/package.json
 *    },
 *    "build": "__ec_package_patch_json_not_exist_originally__" // means not exists originally
 *  }
 */
function initReverter(_rootPkgJSON, _pkgDirPath) {
  assert(_rootPkgJSON);
  assert(_pkgDirPath);

  function slowCloneJSON(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureHostRecord() {
    if (!_rootPkgJSON[PACKAGE_JSON_REVERT_RECORD_KEY]) {
      _rootPkgJSON[PACKAGE_JSON_REVERT_RECORD_KEY] = {};
    }
    // else already recorded, do not earse, consider patch twice.
    return _rootPkgJSON[PACKAGE_JSON_REVERT_RECORD_KEY];
  }

  return {

    initReverterPart({subPathWrapper, notExistOriginally}) {
      assert(subPathWrapper);
      assert(notExistOriginally != null);

      const hostRecord = ensureHostRecord();
      const revertRecordPartKey = subPathWrapper.makeStringKey();
      let part = hostRecord[revertRecordPartKey];
      if (!hostRecord.hasOwnProperty(revertRecordPartKey)) {
        part = hostRecord[revertRecordPartKey] = notExistOriginally ? JSON_NOT_EXIST_ORIGINALLY : {};
      }
      // else already recorded, do not earse, consider patch twice.

      return {
        recordUpdateOnKey(targetPkgJSON, key) {
          assert(targetPkgJSON);
          assert(key != null);

          if (part === JSON_NOT_EXIST_ORIGINALLY) {
            return;
          }
          if (part.hasOwnProperty(key)) {
            // already recorded, do not earse, consider patch twice.
            return;
          }
          const oldValue = targetPkgJSON[key];
          part[key] = oldValue === undefined
            ? JSON_NOT_EXIST_ORIGINALLY
            : slowCloneJSON(oldValue);
        },
      };
    },

    performRevert({onDeleteFile, onUpdatePkgJSON}) {
      const hostRecord = _rootPkgJSON[PACKAGE_JSON_REVERT_RECORD_KEY];
      if (!hostRecord) {
        return;
      }
      delete _rootPkgJSON[PACKAGE_JSON_REVERT_RECORD_KEY];

      for (const partKey of Object.keys(hostRecord)) {
        const part = hostRecord[partKey];
        const subPathWrapper = initSubPathWrapper(_pkgDirPath).resetFromStringKey(partKey);
        if (part === JSON_NOT_EXIST_ORIGINALLY) {
          onDeleteFile(subPathWrapper);
        }
        else {
          onUpdatePkgJSON(subPathWrapper, ({onDeleteKV, onRevertKV}) => {
            for (const key of Object.keys(part)) {
              const originalValue = part[key];
              if (originalValue === JSON_NOT_EXIST_ORIGINALLY) {
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


async function patchPackage(amenderMap, packageName, revert, committer, isDryRun) {

  function revertPackage(tag, pkgDirPath, rootPkgJSON, rootPkgJSONPath, committer) {
    const reverter = initReverter(rootPkgJSON, pkgDirPath);
    reverter.performRevert({

      onDeleteFile(subPathWrapper) {
        const filePathStr = subPathWrapper.getAbsolutePath();
        console.log(`${tag} will_delete: ${filePathStr}`);
        committer.deleteFile(filePathStr, tag);
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
            console.log(`${tag} delete_attr: "${key}"`);
          },
          onRevertKV(key, originalValue) {
            pkgJSON[key] = originalValue;
            console.log(`${tag} set_attr: "${key}": ${loggableJSONValue(originalValue)}`);
          }
        });
        committer.writeJSONFile(filePathStr, pkgJSON, tag);
      }
    });
  }

  /**
   * @public
   * @type {SetPkgJSONAttr}
   */
  function setPkgJSONAttr(
    // @private [Function.bind args]:
    tag, reverterPart, targetPkgJSON,
    // @public [User (of this module) input args]:
    key, value
  ) {
    reverterPart.recordUpdateOnKey(targetPkgJSON, key);
    targetPkgJSON[key] = value;
    console.log(`${tag} set_attr: "${key}": ${loggableJSONValue(value)}`);
  }

  /**
   * @public
   * @type {EnsureSubPkgJSON}
   */
  function ensureSubPkgJSON(
    // @private [Function.bind args]:
    tag, pkgDirPath, reverter, committer, subDirArrayPath,
    // @public [User (of this module) input args]:
    subAmender
  ) {
    const dirSubPathWrapper = initSubPathWrapper(pkgDirPath).resetFromArrayPath(subDirArrayPath);
    const dirSubAbsolutePath = dirSubPathWrapper.getAbsolutePath();
    assert(
      nodeFS.existsSync(dirSubAbsolutePath),
      `${tag} [ensureSubPkgJSON] ${dirSubAbsolutePath} not exists.`
    );
    assert(
      nodeFS.statSync(dirSubAbsolutePath).isDirectory(),
      `${tag} [ensureSubPkgJSON] ${dirSubAbsolutePath} is not a directory.`
    );
    const pgkJSONSubPathWrapper = initSubPathWrapper(pkgDirPath).resetFromArrayPath(subDirArrayPath, 'package.json');
    const pkgJSONSubAbsolutePath = pgkJSONSubPathWrapper.getAbsolutePath();
    const isSubPkgJSONExist = nodeFS.existsSync(pkgJSONSubAbsolutePath);

    let subPkgJSON;
    let reverterSubPart;
    let commitMsg;
    if (isSubPkgJSONExist) {
      console.log(`${tag} will_update: ${pkgJSONSubAbsolutePath}`);
      commitMsg = `${tag} update`;
      subPkgJSON = require(pkgJSONSubAbsolutePath);
      reverterSubPart = reverter.initReverterPart({
        subPathWrapper: pgkJSONSubPathWrapper,
        notExistOriginally: false
      });
    }
    else {
      console.log(`${tag} will create: ${pkgJSONSubAbsolutePath}`);
      commitMsg = `${tag} create`;
      subPkgJSON = {};
      reverterSubPart = reverter.initReverterPart({
        subPathWrapper: pgkJSONSubPathWrapper,
        notExistOriginally: true
      });
    }

    subAmender({
      setPkgJSONAttr: setPkgJSONAttr.bind(null, tag, reverterSubPart, subPkgJSON)
    });

    committer.writeJSONFile(pkgJSONSubAbsolutePath, subPkgJSON, commitMsg);
  }

  function callPkgAmender(tag, amenderMap, pkgDirPath, rootPkgJSON, rootPkgJSONPath, committer) {
    const reverter = initReverter(rootPkgJSON, pkgDirPath);
    const reverterRootPart = reverter.initReverterPart({
      subPathWrapper: initSubPathWrapper(pkgDirPath).resetFromArrayPath([], 'package.json'),
      notExistOriginally: false
    });

    amenderMap[packageName]({
      setPkgJSONAttr: setPkgJSONAttr.bind(null, tag, reverterRootPart, rootPkgJSON),
      ensureSubPkgJSON: ensureSubPkgJSON.bind(null, tag, pkgDirPath, reverter, committer),
    });

    committer.writeJSONFile(rootPkgJSONPath, rootPkgJSON, `${tag} update`);
  }

  async function doPatchPackage(amenderMap, packageName, revert, committer, isDryRun) {
    const pkgDirList = await fetchPkgDirList(packageName);
    for (const pkgDirPath of pkgDirList) {
      assert(pkgDirPath);
      assert(nodeFS.existsSync(pkgDirPath));
      assert(nodeFS.statSync(pkgDirPath).isDirectory());

      const tag = getMsgTag(revert, isDryRun);
      const rootPkgJSONPath = nodePath.join(pkgDirPath, 'package.json');
      console.log(`${tag} will_update: ${rootPkgJSONPath}`);
      const rootPkgJSON = require(rootPkgJSONPath);

      if (revert) {
        revertPackage(tag, pkgDirPath, rootPkgJSON, rootPkgJSONPath, committer);
      }
      else {
        callPkgAmender(tag, amenderMap, pkgDirPath, rootPkgJSON, rootPkgJSONPath, committer);
      }
    }
  }

  await doPatchPackage(amenderMap, packageName, revert, committer, isDryRun);
} // patchPackage end


function createCommitter(commitList, isDryRun) {
  return {
    deleteFile: function (filePath, extraMsg) {
      commitList.push(() => {
        if (nodeFS.existsSync(filePath) && nodeFS.statSync(filePath).isFile()) {
          console.log(`${extraMsg} deleting file: ${filePath}`);
          if (!isDryRun) {
            nodeFS.unlinkSync(filePath);
          }
        }
      });
    },
    writeJSONFile: function (filePath, jsonObj, extraMsg) {
      commitList.push(() => {
        console.log(`${extraMsg} writing file: ${filePath}`);
        if (!isDryRun) {
          const content = JSON.stringify(jsonObj, null, 2);
          nodeFS.writeFileSync(filePath, content);
        }
      });
    }
  };
}

/**
 * @param {AmendPackageConfig} config
 * @param {PackageName} packageName
 * @param {boolean} revert
 * @param {boolean} isDryRun
 */
async function dealPatch(config, packageName, revert, isDryRun) {
  if (!isObject(config.amenderMap) || Object.keys(config.amenderMap).length === 0) {
    errorExit('No package amender registered. Check --help for usage.');
  }
  const amenderMap = Object.assign({}, config.amenderMap);

  const packageNameList = [];
  if (packageName) {
    if (!amenderMap[packageName]) {
      errorExit(`Unknown package: ${packageName}`);
    }
    packageNameList.push(packageName);
  }
  else {
    packageNameList.push(...Object.keys(amenderMap));
  }

  console.log(`[target_packages]: ${packageNameList.join(', ')}`);

  // Collect commits and execute at last. Just try to prevent from
  // crashing after half-way modification by some unexpected assertion fail.
  // (Assume that commits is not too much to cause big memory usage).
  const commitList = [];
  const committer = createCommitter(commitList, isDryRun);

  // patch
  await Promise.all(packageNameList.map(pkgName => patchPackage(amenderMap, pkgName, revert, committer, isDryRun)));

  // commit
  console.log('Committing...');
  await Promise.all(commitList.map(commit => commit()));
  console.log('Commit done.');
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
    const packageName = values.package;
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

    await dealPatch(config, packageName, revert, isDryRun);
  }
};
