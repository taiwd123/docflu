#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { syncFile, syncDocs, syncBlog, syncReverse } = require('../lib/commands/sync');
const { initProject } = require('../lib/commands/init');

const program = new Command();

// Read version from package.json
const packageJson = require('../package.json');

program
  .name('docflu')
  .description('CLI tool to sync Docusaurus documentation to Confluence with hierarchy, internal links, and Mermaid diagram support')
  .version(packageJson.version);

program
  .command('sync')
  .description('Sync markdown content to Confluence')
  .option('-f, --file <path>', 'specific file to sync')
  .option('--docs', 'sync all documents in docs/ directory')
  .option('--blog', 'sync all blog posts in blog/ directory')
  .option('--dry-run', 'preview changes without syncing')
  .option('--reverse', 'sync from Confluence back to Docusaurus (only changed pages)')
  .action(async (options) => {
    try {
      if (options.reverse) {
        console.log(chalk.blue('🔄 Reverse syncing from Confluence to Docusaurus'));
        await syncReverse(options.dryRun);
      } else if (options.file) {
        console.log(chalk.blue('🚀 Syncing single file:', options.file));
        await syncFile(options.file, options.dryRun);
      } else if (options.docs) {
        console.log(chalk.blue('🚀 Syncing all docs/'));
        await syncDocs(options.dryRun);
      } else if (options.blog) {
        console.log(chalk.blue('🚀 Syncing all blog/'));
        await syncBlog(options.dryRun);
      } else {
        console.log(chalk.red('❌ Please specify --file, --docs, --blog, or --reverse option'));
        console.log('Examples:');
        console.log('  docflu sync --file docs/intro.md');
        console.log('  docflu sync --docs');
        console.log('  docflu sync --blog');
        console.log('  docflu sync --reverse');
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize DocFlu in current directory')
  .action(async () => {
    try {
      await initProject();
    } catch (error) {
      console.error(chalk.red('❌ Error:', error.message));
      process.exit(1);
    }
  });

program.parse(); 