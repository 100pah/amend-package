#!/usr/bin/env node

const {runCLI} = require('../lib/amend-package.cjs');

process.title = 'amend-package';
runCLI(process.argv);
