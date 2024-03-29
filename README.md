# amend-package

> [!CAUTION]
> Modify package is not recommended. Do not use this way unless there is no other solution and you known there is no risk in your scenario.

Modify npm installed packages.
+ Modify package.json.
+ Add sub package.json.

amend-package has been tested in npm v8+, pnpm v8, yarn v1.x, node v16+.

## Usage

1. Install, e.g.,
  ```shell
  npm install -D amend-package
  ```
2. Write your modification code in your `amend-package.config.js` (or name it yourself)
  + Note: there is some built-in `xxx.config.js`, list it using `--list-builtin-config` and use it directly using `--builtin-config xxx.config.js`.
3. Run the script as follows. In most scenarios you should better put it in `postinstall` of the `package.json` of you project, then it can be called automatically after npm install. e.g.:
  ```json
  {
    "scripts": {
      "postinstall": "npx amend-package --config amend-package.config.cjs"
    }
  }
  ```

## cli usage examples

```shell
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
```

## cli options

+ --help
  Print help.

+ --config
  Specify the config file path.
  At present only CommonJS is supported in the config file.
  The config file is loaded via
    const config = require(require('node:path').resolve(cmdInputConfigPath)).
  See the example config files in "amend-package/builtin-config/*.config.cjs".
  Either --builtin-config or --config must be specified.

+ --builtin-config
  Specify the config file name.
  e.g. --builtin-config fix-vue-echarts-esm.config.cjs
  Either --builtin-config or --config must be specified.

+ --list-builtin-config
  List built-in config files.

+ --dry-run
  Just log what will be changed but do not change anything.

+ --package <package_name>
  Specify the package (npm package name) to modify.
  If not specified, modify all packages.
  e.g. --package some_pkg_name

+ --revert
  Revert the modifications.

+ --builtin-case
  List built-in cases.

+ --case <case_name>
  Specify a case to run.
  If not specified, run all cases.


## Example of amend-package.config.cjs

```js
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
```
