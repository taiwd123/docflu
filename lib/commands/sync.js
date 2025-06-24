const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs-extra');

const Config = require('../core/config');
const MarkdownParser = require('../core/markdown-parser');
const ConfluenceClient = require('../core/confluence-client');
const ImageProcessor = require('../core/image-processor');
const DocusaurusScanner = require('../core/docusaurus-scanner');
const StateManager = require('../core/state-manager');
const HtmlToMarkdownParser = require('../core/html-to-markdown-parser');

/**
 * Sync single markdown file to Confluence
 * @param {string} filePath - path to markdown file
 * @param {boolean} dryRun - preview mode without actual sync
 */
async function syncFile(filePath, dryRun = false) {
  const spinner = ora('Starting sync process...').start();

  try {
    // Step 1: Load configuration
    spinner.text = 'Loading configuration...';
    const config = new Config();
    const confluenceConfig = await config.loadConfig();

    // Step 2: Validate file path
    spinner.text = 'Validating file path...';
    const absolutePath = path.resolve(filePath);
    
    if (!await fs.pathExists(absolutePath)) {
      throw new Error(`File không tồn tại: ${filePath}`);
    }

    if (!filePath.endsWith('.md')) {
      throw new Error(`File phải có extension .md: ${filePath}`);
    }

    // Step 3: Connect to Confluence
    spinner.text = 'Connecting to Confluence...';
    const confluenceClient = new ConfluenceClient(confluenceConfig);

    // Step 4: Parse markdown
    spinner.text = 'Parsing markdown content...';
    const projectRoot = process.cwd();
    const stateManager = new StateManager(projectRoot);
    await stateManager.init();
    
    const parser = new MarkdownParser(projectRoot, stateManager, confluenceClient);
    const parsedContent = await parser.parseFile(absolutePath, confluenceConfig.baseUrl);
    
    const connected = await confluenceClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Confluence');
    }

    // Step 5: Get parent page (if specified)
    let parentId = null;
    if (confluenceConfig.rootPageTitle) {
      spinner.text = 'Finding root page...';
      const rootPage = await confluenceClient.getRootPage();
      if (rootPage) {
        parentId = rootPage.id;
        console.log(chalk.blue('📂 Parent page found:', rootPage.title));
      }
    }

    // Step 6: Preview or sync
    if (dryRun) {
      spinner.succeed('Dry run completed');
      
      console.log(chalk.cyan('\n📋 PREVIEW:'));
      console.log(chalk.white('Title:'), parsedContent.title);
      console.log(chalk.white('Parent:'), parentId ? `ID ${parentId}` : 'None');
      console.log(chalk.white('Content length:'), parsedContent.content.length, 'characters');
      console.log(chalk.white('Frontmatter:'), JSON.stringify(parsedContent.frontmatter, null, 2));
      
      console.log(chalk.yellow('\n⚠️ This is a dry run. No changes were made to Confluence.'));
      return {
        success: true,
        action: 'preview',
        title: parsedContent.title,
        contentLength: parsedContent.content.length
      };
    }

    // Step 7: Create or update page (without images first)
    spinner.text = `Creating/updating page "${parsedContent.title}"...`;
    
    const pageData = {
      title: parsedContent.title,
      content: parsedContent.content,
      parentId: parentId
    };

    const result = await confluenceClient.createOrUpdatePage(pageData);

    // Step 8: Process Mermaid diagrams and regular images, then update page if needed
    spinner.text = 'Processing images and diagrams...';
    
    // Re-parse with pageId for Mermaid processing
    const finalParsedContent = await parser.parseMarkdown(
      parsedContent.originalMarkdown,
      parsedContent.frontmatter,
      absolutePath,
      confluenceConfig.baseUrl,
      result.id
    );

    // Process regular images on the original HTML content (before Mermaid processing)
    const imageProcessor = new ImageProcessor(confluenceClient, path.dirname(absolutePath));
    const contentWithImages = await imageProcessor.processImages(
      result.id,
      finalParsedContent.originalMarkdown,
      finalParsedContent.htmlContent,
      absolutePath,
      confluenceConfig.baseUrl
    );

    // Update page with processed content if anything changed
    if (contentWithImages !== parsedContent.htmlContent || finalParsedContent.mermaidStats?.processed > 0) {
      spinner.text = 'Updating page with images and diagrams...';
      
      // Use the final Confluence content (which already includes Mermaid processing)
      let finalContent = finalParsedContent.content;
      
      // If images were processed, we need to merge image processing with Mermaid processing
      if (contentWithImages !== finalParsedContent.htmlContent) {
        // Convert processed images HTML to Confluence format and merge with Mermaid content
        const imageConfluenceContent = parser.convertToConfluenceFormat(contentWithImages);
        // For now, use the Mermaid-processed content (images will be handled separately)
        finalContent = finalParsedContent.content;
      }
      
      const version = result.version?.number || 1;
      await confluenceClient.updatePage(result.id, result.title, finalContent, version + 1);
      
      if (finalParsedContent.mermaidStats?.processed > 0) {
        console.log(chalk.green(`🎨 Processed ${finalParsedContent.mermaidStats.processed} Mermaid diagram(s)`));
      }
      if (contentWithImages !== parsedContent.htmlContent) {
        console.log(chalk.green('📷 Images processed and uploaded'));
      }
    }

    // Cleanup temporary resources
    await parser.cleanup();
    
    // Store page information in state manager
    const relativeFilePath = path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
    stateManager.setPageState(relativeFilePath, {
      confluenceId: result.id,
      title: result.title,
      lastModified: new Date().toISOString(),
      version: result.version?.number || 1,
      parentId: parentId
    });
    
    // Save state
    await stateManager.saveState();
    
    spinner.succeed('Sync completed successfully');
    
    console.log(chalk.green('\n✅ SUCCESS:'));
    console.log(chalk.white('Page ID:'), result.id);
    console.log(chalk.white('Title:'), result.title);
    console.log(chalk.white('URL:'), `${confluenceConfig.baseUrl}/pages/viewpage.action?pageId=${result.id}`);

    return {
      success: true,
      action: result.version?.number === 1 ? 'created' : 'updated',
      pageId: result.id,
      title: result.title,
      url: `${confluenceConfig.baseUrl}/pages/viewpage.action?pageId=${result.id}`
    };

  } catch (error) {
    spinner.fail('Sync failed');
    
    console.error(chalk.red('\n❌ ERROR:'));
    console.error(chalk.white('Message:'), error.message);
    
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray('Stack:'), error.stack);
    }

    throw error;
  }
}

/**
 * Sync all documents in docs/ directory
 * @param {boolean} dryRun - preview mode without actual sync
 */
async function syncDocs(dryRun = false) {
  const spinner = ora('Starting docs sync...').start();

  try {
    const projectRoot = process.cwd();
    
    // Step 1: Load configuration
    spinner.text = 'Loading configuration...';
    const config = new Config();
    const confluenceConfig = await config.loadConfig();

    // Step 2: Initialize state manager
    spinner.text = 'Initializing state manager...';
    const stateManager = new StateManager(projectRoot);
    await stateManager.init();

    // Step 3: Scan Docusaurus project
    spinner.text = 'Scanning Docusaurus project...';
    const scanner = new DocusaurusScanner(projectRoot);
    await scanner.detectProject();

    // Step 4: Scan docs directory
    spinner.text = 'Scanning docs directory...';
    const excludePatterns = (process.env.DOCFLU_EXCLUDE_PATTERNS || '').split(',').filter(Boolean);
    const documents = await scanner.scanDocs({ excludePatterns });

    if (documents.length === 0) {
      spinner.warn('No documents found in docs/');
      return { success: true, processed: 0, created: 0, updated: 0, skipped: 0 };
    }

    // Step 5: Connect to Confluence
    spinner.text = 'Connecting to Confluence...';
    const confluenceClient = new ConfluenceClient(confluenceConfig);
    
    const connected = await confluenceClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Confluence');
    }

    // Step 6: Get parent page
    let parentId = null;
    if (confluenceConfig.rootPageTitle) {
      spinner.text = 'Finding root page...';
      const rootPage = await confluenceClient.getRootPage();
      if (rootPage) {
        parentId = rootPage.id;
        console.log(chalk.blue('📂 Parent page found:', rootPage.title));
      }
    }

    // Step 7: Reset stats for new sync
    stateManager.resetStats();

    // Step 8: Build hierarchy map
    spinner.text = 'Building page hierarchy...';
    const hierarchyMap = new Map();
    
    // Pre-create parent pages for all categories
    const categories = [...new Set(documents.map(d => d.category).filter(Boolean))];
    
    for (const category of categories) {
      if (!hierarchyMap.has(category)) {
        const categoryParentId = await confluenceClient.findOrCreateParentPage(category, parentId);
        hierarchyMap.set(category, categoryParentId);
      }
    }

    // Step 9: Process documents
    const stats = { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
    
    for (const [index, document] of documents.entries()) {
      const progress = `(${index + 1}/${documents.length})`;
      
      try {
        // Check if document needs sync
        if (!dryRun && !stateManager.needsSync(document.relativePath, document.lastModified)) {
          spinner.text = `${progress} Skipping ${document.title} (no changes)`;
          stats.skipped++;
          stateManager.updateStats('skipped');
          continue;
        }

        spinner.text = `${progress} Processing ${document.title}...`;

        if (dryRun) {
          const documentParentId = document.category ? hierarchyMap.get(document.category) : parentId;
          
          console.log(chalk.cyan(`\n📄 ${document.title}`));
          console.log(chalk.white('  Path:'), document.relativePath);
          console.log(chalk.white('  Category:'), document.category || 'root');
          console.log(chalk.white('  Parent ID:'), documentParentId || 'root');
          console.log(chalk.white('  Has images:'), document.hasImages ? 'Yes' : 'No');
          console.log(chalk.white('  Last modified:'), document.lastModified.toISOString());
          
          stats.processed++;
          continue;
        }

        // Parse document content with reference processing
        const parser = new MarkdownParser(projectRoot, stateManager, confluenceClient);
        const parsedContent = await parser.parseMarkdown(
          document.content, 
          document.frontmatter, 
          document.filePath,
          confluenceConfig.baseUrl
        );
        parsedContent.title = document.title;

        // Get appropriate parent ID for this document
        const documentParentId = document.category ? hierarchyMap.get(document.category) : parentId;

        // Create or update page
        const pageData = {
          title: document.title,
          content: parsedContent.content,
          parentId: documentParentId
        };

        const result = await confluenceClient.createOrUpdatePage(pageData);
        const isNewPage = result.version?.number === 1;

        // Process images and Mermaid diagrams if needed
        if (document.hasImages || document.hasMermaid) {
          // Re-parse with pageId for Mermaid processing
          const finalParsedContent = await parser.parseMarkdown(
            document.content,
            document.frontmatter,
            document.filePath,
            confluenceConfig.baseUrl,
            result.id
          );

          const imageProcessor = new ImageProcessor(confluenceClient, path.dirname(document.filePath));
          
          const contentWithImages = await imageProcessor.processImages(
            result.id,
            finalParsedContent.originalMarkdown,
            finalParsedContent.htmlContent,
            document.filePath,
            confluenceConfig.baseUrl
          );

          if (contentWithImages !== parsedContent.htmlContent || finalParsedContent.mermaidStats?.processed > 0) {
            const finalContent = parser.convertToConfluenceFormat(contentWithImages);
            const version = result.version?.number || 1;
            await confluenceClient.updatePage(result.id, result.title, finalContent, version + 1);
          }
        }

        // Cleanup temporary resources
        await parser.cleanup();

        // Update state
        stateManager.setPageState(document.relativePath, {
          confluenceId: result.id,
          title: document.title,
          category: document.category,
          slug: document.slug,
          lastModified: document.lastModified.toISOString(),
          parentId: documentParentId,
          spaceKey: confluenceConfig.spaceKey
        });

        // Update stats
        if (isNewPage) {
          stats.created++;
          stateManager.updateStats('created');
          console.log(chalk.green(`✅ Created: ${document.title}`));
        } else {
          stats.updated++;
          stateManager.updateStats('updated');
          console.log(chalk.blue(`📝 Updated: ${document.title}`));
        }
        
        stats.processed++;

      } catch (error) {
        stats.failed++;
        stateManager.updateStats('failed');
        console.error(chalk.red(`❌ Failed: ${document.title} - ${error.message}`));
      }
    }

    // Step 10: Save state
    if (!dryRun) {
      await stateManager.saveState();
      
      // Cleanup orphaned pages
      const existingFiles = documents.map(d => d.relativePath);
      await stateManager.cleanupOrphanedPages(existingFiles);
    }

    spinner.succeed(dryRun ? 'Docs preview completed' : 'Docs sync completed');

    // Step 11: Show summary
    console.log(chalk.cyan('\n📊 SUMMARY:'));
    console.log(chalk.white('Total documents:'), documents.length);
    console.log(chalk.white('Processed:'), stats.processed);
    console.log(chalk.green('Created:'), stats.created);
    console.log(chalk.blue('Updated:'), stats.updated);
    console.log(chalk.yellow('Skipped:'), stats.skipped);
    console.log(chalk.red('Failed:'), stats.failed);

    if (dryRun) {
      console.log(chalk.yellow('\n⚠️ This is a dry run. No changes were made to Confluence.'));
    }

    return {
      success: true,
      ...stats
    };

  } catch (error) {
    spinner.fail('Docs sync failed');
    
    console.error(chalk.red('\n❌ ERROR:'));
    console.error(chalk.white('Message:'), error.message);
    
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray('Stack:'), error.stack);
    }

    throw error;
  }
}

/**
 * Sync all blog posts in blog/ directory
 * @param {boolean} dryRun - preview mode without actual sync
 */
async function syncBlog(dryRun = false) {
  const spinner = ora('Starting blog sync...').start();

  try {
    const projectRoot = process.cwd();
    
    // Step 1: Load configuration
    spinner.text = 'Loading configuration...';
    const config = new Config();
    const confluenceConfig = await config.loadConfig();

    // Step 2: Initialize state manager
    spinner.text = 'Initializing state manager...';
    const stateManager = new StateManager(projectRoot);
    await stateManager.init();

    // Step 3: Scan Docusaurus project
    spinner.text = 'Scanning Docusaurus project...';
    const scanner = new DocusaurusScanner(projectRoot);
    await scanner.detectProject();

    // Step 4: Scan blog directory
    spinner.text = 'Scanning blog directory...';
    const excludePatterns = (process.env.DOCFLU_EXCLUDE_PATTERNS || '').split(',').filter(Boolean);
    const posts = await scanner.scanBlog({ excludePatterns });

    if (posts.length === 0) {
      spinner.warn('No blog posts found in blog/');
      return { success: true, processed: 0, created: 0, updated: 0, skipped: 0 };
    }

    // Step 5: Connect to Confluence
    spinner.text = 'Connecting to Confluence...';
    const confluenceClient = new ConfluenceClient(confluenceConfig);
    
    const connected = await confluenceClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Confluence');
    }

    // Step 6: Get parent page
    let parentId = null;
    if (confluenceConfig.rootPageTitle) {
      spinner.text = 'Finding root page...';
      const rootPage = await confluenceClient.getRootPage();
      if (rootPage) {
        parentId = rootPage.id;
        console.log(chalk.blue('📂 Parent page found:', rootPage.title));
      }
    }

    spinner.succeed(dryRun ? 'Blog preview completed' : 'Blog sync completed');
    
    console.log(chalk.cyan('\n📊 SUMMARY:'));
    console.log(chalk.white('Total blog posts:'), posts.length);
    console.log(chalk.yellow('Blog sync implementation coming soon!'));

    return {
      success: true,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: posts.length
    };

  } catch (error) {
    spinner.fail('Blog sync failed');
    
    console.error(chalk.red('\n❌ ERROR:'));
    console.error(chalk.white('Message:'), error.message);
    
    throw error;
  }
}

/**
 * Sync from Confluence back to Docusaurus
 * @param {boolean} dryRun - preview mode without actual sync
 */
async function syncReverse(dryRun = false) {
  const spinner = ora('Starting reverse sync from Confluence to Docusaurus...').start();

  try {
    const projectRoot = process.cwd();
    
    // Step 1: Load configuration
    spinner.text = 'Loading configuration...';
    const config = new Config();
    const confluenceConfig = await config.loadConfig();

    // Step 2: Initialize state manager
    spinner.text = 'Initializing state manager...';
    const stateManager = new StateManager(projectRoot);
    await stateManager.loadState();

    // Step 3: Connect to Confluence
    spinner.text = 'Connecting to Confluence...';
    const confluenceClient = new ConfluenceClient(confluenceConfig);
    
    const connected = await confluenceClient.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Confluence');
    }

    // Step 4: Scan Docusaurus project
    spinner.text = 'Scanning Docusaurus project...';
    const scanner = new DocusaurusScanner(projectRoot);
    await scanner.detectProject();

    // Step 5: Get sync state to find tracked pages
    spinner.text = 'Retrieving sync state...';
    const pages = stateManager.getAllPages();
    
    if (!pages || Object.keys(pages).length === 0) {
      spinner.warn('No previously synced pages found. Please sync to Confluence first.');
      return { success: true, processed: 0, updated: 0, skipped: 0 };
    }
    
    // Convert pages object to array of entries for iteration
    const allPages = Object.entries(pages);
    console.log(`Found ${allPages.length} pages to check for updates`);

    // Step 6: Check each page in sync state for updates in Confluence
    spinner.text = 'Checking for updated pages in Confluence...';
    
    const htmlToMarkdownParser = new HtmlToMarkdownParser(projectRoot);
    const stats = { processed: 0, updated: 0, skipped: 0 };
    
    // Reset stats for new sync
    stateManager.resetStats();
    
    for (const [filePath, pageInfo] of allPages) {
      const confluenceId = pageInfo.confluenceId;
      if (!confluenceId) continue;
      
      spinner.text = `Checking page: ${pageInfo.title}`;
      
      try {
        // Get page from Confluence with full content
        const confluencePage = await confluenceClient.getPageById(confluenceId, 'body.storage,version');
        
        if (!confluencePage) {
          console.log(chalk.yellow(`⚠️ Page not found in Confluence: ${pageInfo.title}`));
          stats.skipped++;
          continue;
        }
        
        // Check if the page was updated in Confluence after our last sync
        const lastSyncVersion = pageInfo.version || 1;
        const currentVersion = confluencePage.version?.number || 1;
        
        if (currentVersion <= lastSyncVersion) {
          // Page hasn't been updated in Confluence
          stats.skipped++;
          continue;
        }
        
        // Page was updated in Confluence, convert it back to Markdown
        const confluenceContent = confluencePage.body?.storage?.value || '';
        const absoluteFilePath = path.resolve(projectRoot, filePath);
        
        // Check if the file exists in Docusaurus
        if (!await fs.pathExists(absoluteFilePath)) {
          console.log(chalk.yellow(`⚠️ File not found in Docusaurus: ${filePath}`));
          stats.skipped++;
          continue;
        }
        
        // Read the original file to preserve frontmatter
        const originalContent = await fs.readFile(absoluteFilePath, 'utf8');
        const { data: frontmatter } = require('gray-matter')(originalContent);
        
        // Convert Confluence content to Markdown
        const markdownContent = await htmlToMarkdownParser.convertToMarkdown(
          confluenceContent, 
          confluenceId,
          absoluteFilePath
        );
        
        // Build the new markdown file with preserved frontmatter
        let newContent = '';
        
        // Add frontmatter
        if (Object.keys(frontmatter).length > 0) {
          newContent += '---\n';
          for (const [key, value] of Object.entries(frontmatter)) {
            if (typeof value === 'string') {
              newContent += `${key}: "${value}"\n`;
            } else {
              newContent += `${key}: ${JSON.stringify(value)}\n`;
            }
          }
          newContent += '---\n\n';
        }
        
        // Add converted markdown content
        newContent += markdownContent;
        
        stats.processed++;
        
        if (dryRun) {
          console.log(chalk.cyan(`📄 Would update: ${filePath}`));
          stats.skipped++;
        } else {
          // Write the updated content back to the file
          await fs.writeFile(absoluteFilePath, newContent, 'utf8');
          
          // Update the sync state with the new version
          stateManager.setPageState(filePath, {
            ...pageInfo,
            version: currentVersion,
            lastModified: new Date().toISOString()
          });
          
          console.log(chalk.green(`✅ Updated: ${filePath}`));
          stats.updated++;
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ Error processing ${filePath}: ${error.message}`));
        stats.skipped++;
      }
    }
    
    // Save the updated state
    await stateManager.saveState();
    
    spinner.succeed('Reverse sync completed');
    
    console.log(chalk.green('\n✅ REVERSE SYNC SUMMARY:'));
    console.log(chalk.white('Processed:'), stats.processed);
    console.log(chalk.white('Updated:'), stats.updated);
    console.log(chalk.white('Skipped:'), stats.skipped);
    
    if (dryRun) {
      console.log(chalk.yellow('\n⚠️ This was a dry run. No files were actually updated.'));
    }
    
    return {
      success: true,
      processed: stats.processed,
      updated: stats.updated,
      skipped: stats.skipped
    };
    
  } catch (error) {
    spinner.fail('Reverse sync failed');
    
    console.error(chalk.red('\n❌ ERROR:'));
    console.error(chalk.white('Message:'), error.message);
    
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray('Stack:'), error.stack);
    }
    
    throw error;
  }
}

module.exports = {
  syncFile,
  syncDocs,
  syncBlog,
  syncReverse
}; 