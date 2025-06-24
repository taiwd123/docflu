/**
 * HTML to Markdown Parser
 * Converts Confluence HTML content back to Markdown
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const TurndownService = require('turndown');

class HtmlToMarkdownParser {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*'
    });
    
    this.setupTurndownRules();
  }

  /**
   * Set up custom Turndown rules for Confluence-specific elements
   */
  setupTurndownRules() {
    // Handle code blocks with language specification
    this.turndownService.addRule('confluenceCodeBlock', {
      filter: (node) => {
        return (
          node.nodeName === 'DIV' && 
          node.classList.contains('code') && 
          node.querySelector('pre')
        );
      },
      replacement: (content, node) => {
        const language = node.getAttribute('data-language') || '';
        const codeContent = node.querySelector('pre').textContent;
        return `\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`;
      }
    });

    // Handle Confluence info/note/warning macros
    this.turndownService.addRule('confluenceAdmonitions', {
      filter: (node) => {
        return (
          node.nodeName === 'DIV' && 
          (node.classList.contains('confluence-information-macro') || 
           node.classList.contains('confluence-warning-macro') || 
           node.classList.contains('confluence-note-macro'))
        );
      },
      replacement: (content, node) => {
        let type = 'info';
        if (node.classList.contains('confluence-warning-macro')) {
          type = 'warning';
        } else if (node.classList.contains('confluence-note-macro')) {
          type = 'note';
        }
        
        const titleElement = node.querySelector('.confluence-information-macro-title');
        const title = titleElement ? titleElement.textContent : '';
        
        const bodyElement = node.querySelector('.confluence-information-macro-body');
        const body = bodyElement ? this.turndownService.turndown(bodyElement) : '';
        
        // Convert to Docusaurus admonition format
        return `\n:::${type}${title ? ' ' + title : ''}\n${body}\n:::\n\n`;
      }
    });

    // Handle Confluence tables
    this.turndownService.addRule('confluenceTables', {
      filter: 'table',
      replacement: (content, node) => {
        // This is a simplified version - for complex tables, more processing would be needed
        const rows = Array.from(node.querySelectorAll('tr'));
        
        if (rows.length === 0) return '';
        
        let markdown = '\n';
        
        // Process header row
        const headerCells = Array.from(rows[0].querySelectorAll('th'));
        if (headerCells.length > 0) {
          markdown += '| ' + headerCells.map(cell => {
            return this.turndownService.turndown(cell.innerHTML).trim();
          }).join(' | ') + ' |\n';
          
          // Add separator row
          markdown += '| ' + headerCells.map(() => '---').join(' | ') + ' |\n';
        }
        
        // Process data rows
        for (let i = headerCells.length > 0 ? 1 : 0; i < rows.length; i++) {
          const cells = Array.from(rows[i].querySelectorAll('td'));
          if (cells.length > 0) {
            markdown += '| ' + cells.map(cell => {
              return this.turndownService.turndown(cell.innerHTML).trim();
            }).join(' | ') + ' |\n';
          }
        }
        
        return markdown + '\n';
      }
    });

    // Handle Confluence images
    this.turndownService.addRule('confluenceImages', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        
        // If it's a relative path (already processed by processImages)
        if (!src.startsWith('http') && !src.startsWith('data:')) {
          return `![${alt}](${src})`;
        }
        
        // If it's a Confluence attachment
        if (src.includes('/download/attachments/')) {
          // Extract the filename from the URL
          const filename = src.split('/').pop().split('?')[0];
          return `![${alt}](${filename})`;
        }
        
        return `![${alt}](${src})`;
      }
    });

    // Handle Mermaid diagrams (which are likely images in Confluence)
    this.turndownService.addRule('mermaidDiagrams', {
      filter: (node) => {
        return (
          node.nodeName === 'IMG' && 
          node.getAttribute('alt') && 
          node.getAttribute('alt').includes('mermaid-diagram')
        );
      },
      replacement: (content, node) => {
        // This is a placeholder - in a real implementation, you would need to
        // retrieve the original Mermaid code from somewhere (perhaps a comment or metadata)
        return '\n```mermaid\n// Original Mermaid diagram was here\n// Automatic conversion back to Mermaid code is not supported\n```\n\n';
      }
    });

    // Handle Confluence links
    this.turndownService.addRule('confluenceLinks', {
      filter: 'a',
      replacement: (content, node) => {
        const href = node.getAttribute('href');
        
        if (!href) {
          return content;
        }
        
        // If it's an internal Confluence link, try to convert back to relative link
        if (href.includes('/wiki/spaces/') && href.includes('/pages/')) {
          // This would require a lookup from page ID to file path
          // For now, we'll preserve the link as-is with a comment
          return `[${content}](${href})`;
        }
        
        return `[${content}](${href})`;
      }
    });
  }

  /**
   * Convert Confluence HTML content to Markdown
   * @param {string} htmlContent - Confluence HTML content
   * @param {string} pageId - Confluence page ID
   * @param {string} targetFilePath - Target file path for the markdown
   * @returns {Promise<string>} - Markdown content
   */
  async convertToMarkdown(htmlContent, pageId, targetFilePath) {
    try {
      console.log(chalk.blue('🔄 Processing Confluence content...'));
      
      // Process Confluence storage format to make it more HTML-like
      let processedHtml = this.preprocessConfluenceHtml(htmlContent);
      
      // Download and save any images
      console.log(chalk.blue('🖼️ Processing images...'));
      processedHtml = await this.processImages(processedHtml, pageId, targetFilePath);
      
      // Convert to Markdown
      console.log(chalk.blue('📝 Converting to Markdown...'));
      let markdown = this.turndownService.turndown(processedHtml);
      
      // Post-process to fix any issues
      markdown = this.postprocessMarkdown(markdown);
      
      console.log(chalk.green('✅ Successfully converted Confluence content to Markdown'));
      return markdown;
    } catch (error) {
      console.error(chalk.red(`Error converting HTML to Markdown: ${error.message}`));
      throw error;
    }
  }

  /**
   * Preprocess Confluence HTML to make it more standard HTML
   * @param {string} html - Confluence HTML content
   * @returns {string} - Processed HTML
   */
  preprocessConfluenceHtml(html) {
    let processed = html;
    
    // Replace Confluence-specific tags with standard HTML
    processed = processed.replace(/<ac:structured-macro.*?>(.*?)<\/ac:structured-macro>/gs, (match, content) => {
      // Extract macro name
      const macroNameMatch = match.match(/ac:name="(.*?)"/);
      const macroName = macroNameMatch ? macroNameMatch[1] : '';
      
      if (macroName === 'code') {
        // Extract language
        const languageMatch = match.match(/ac:parameter ac:name="language">(.*?)<\/ac:parameter>/);
        const language = languageMatch ? languageMatch[1] : '';
        
        // Extract code content
        const codeMatch = match.match(/<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>/s);
        const code = codeMatch ? codeMatch[1] : '';
        
        return `<div class="code" data-language="${language}"><pre>${code}</pre></div>`;
      }
      
      if (['note', 'info', 'warning'].includes(macroName)) {
        // Extract title
        const titleMatch = match.match(/ac:parameter ac:name="title">(.*?)<\/ac:parameter>/);
        const title = titleMatch ? titleMatch[1] : '';
        
        // Extract body
        const bodyMatch = match.match(/<ac:rich-text-body>(.*?)<\/ac:rich-text-body>/s);
        const body = bodyMatch ? bodyMatch[1] : '';
        
        return `<div class="confluence-${macroName}-macro">
          ${title ? `<div class="confluence-information-macro-title">${title}</div>` : ''}
          <div class="confluence-information-macro-body">${body}</div>
        </div>`;
      }
      
      return match;
    });
    
    // Replace Confluence image tags
    processed = processed.replace(/<ac:image.*?>(.*?)<\/ac:image>/gs, (match) => {
      // Extract image attributes
      const srcMatch = match.match(/ac:src="(.*?)"/);
      const src = srcMatch ? srcMatch[1] : '';
      
      return `<img src="${src}" alt="Confluence Image" />`;
    });
    
    // Replace Confluence link tags
    processed = processed.replace(/<ac:link.*?>(.*?)<\/ac:link>/gs, (match, content) => {
      // Extract link URL
      const urlMatch = match.match(/ri:url="(.*?)"/);
      const url = urlMatch ? urlMatch[1] : '';
      
      // Extract link text
      const textMatch = content.match(/<ac:plain-text-link-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-link-body>/);
      const text = textMatch ? textMatch[1] : (url || 'Link');
      
      return `<a href="${url}">${text}</a>`;
    });
    
    return processed;
  }

  /**
   * Process images in the HTML content
   * @param {string} html - HTML content
   * @param {string} pageId - Confluence page ID
   * @param {string} targetFilePath - Target file path
   * @returns {Promise<string>} - HTML with processed images
   */
  async processImages(html, pageId, targetFilePath) {
    try {
      // Create directory for images if it doesn't exist
      const targetDir = path.dirname(targetFilePath);
      const imagesDir = path.join(targetDir, 'images');
      
      console.log(chalk.blue(`📁 Creating images directory: ${imagesDir}`));
      try {
        await fs.ensureDir(imagesDir);
        console.log(chalk.green(`✅ Images directory created/verified`));
      } catch (dirError) {
        console.error(chalk.red(`❌ Failed to create images directory: ${dirError.message}`));
        // Try to create with mkdirp as fallback
        try {
          await fs.mkdirp(imagesDir);
          console.log(chalk.green(`✅ Images directory created with mkdirp`));
        } catch (mkdirError) {
          console.error(chalk.red(`❌ Failed to create images directory with mkdirp: ${mkdirError.message}`));
          throw new Error(`Cannot create images directory: ${mkdirError.message}`);
        }
      }
      
      // Check if images directory is writable
      try {
        const testFile = path.join(imagesDir, '.test-write');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        console.log(chalk.green(`✅ Images directory is writable`));
      } catch (writeError) {
        console.error(chalk.red(`❌ Images directory is not writable: ${writeError.message}`));
        throw new Error(`Images directory is not writable: ${writeError.message}`);
      }
      
      let processedHtml = html;
      console.log(processedHtml);
      
      // Process Confluence attachment images
      console.log(chalk.blue(`🔍 Processing Confluence attachment images...`));
      processedHtml = await this.processAttachmentImages(processedHtml, imagesDir, targetDir);
      
      // Process embedded images (data URLs)
      console.log(chalk.blue(`🔍 Processing embedded images...`));
      processedHtml = await this.processEmbeddedImages(processedHtml, imagesDir, targetDir);
      
      // Process Confluence content images (non-attachment)
      console.log(chalk.blue(`🔍 Processing external images...`));
      processedHtml = await this.processContentImages(processedHtml, imagesDir, targetDir, pageId);
      
      console.log(chalk.green(`✅ Image processing complete`));
      return processedHtml;
    } catch (error) {
      console.error(chalk.red(`❌ Error processing images: ${error.message}`));
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      return html; // Return original HTML if processing fails
    }
  }

  /**
   * Process Confluence attachment images
   * @param {string} html - HTML content
   * @param {string} imagesDir - Directory to save images
   * @param {string} targetDir - Target directory of the markdown file
   * @returns {Promise<string>} - HTML with processed attachment images
   */
  async processAttachmentImages(html, imagesDir, targetDir) {
    // Find all Confluence attachment URLs - expanded pattern to catch more formats
    const attachmentRegex = /src="(.*?\/(?:download|attachments?)\/(?:attachments?|thumbnails?)\/(\d+)\/([^"?]+)(?:\?[^"]*)?)"[^>]*>/g;
    let match;
    let processedHtml = html;
    let downloadCount = 0;
    
    console.log(chalk.blue(`🔍 Searching for Confluence attachments in HTML...`));
    
    while ((match = attachmentRegex.exec(html)) !== null) {
      const [fullMatch, url, pageId, filename] = match;
      
      try {
        console.log(chalk.blue(`🔗 Found attachment URL: ${url}`));
        
        // Create a safe filename (remove special characters)
        const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        
        // Download the image
        const imagePath = path.join(imagesDir, safeFilename);
        const imageRelativePath = `images/${safeFilename}`;
        
        // Only download if it doesn't exist or if it's older than 1 day
        const shouldDownload = !await fs.pathExists(imagePath) || 
          (await fs.stat(imagePath)).mtime < new Date(Date.now() - 86400000);
        
        if (shouldDownload) {
          console.log(chalk.blue(`📥 Downloading attachment image: ${safeFilename}`));
          
          try {
            const response = await axios({
              method: 'get',
              url: url,
              responseType: 'arraybuffer',
              timeout: 10000, // 10 second timeout
              maxContentLength: 10 * 1024 * 1024 // 10MB max
            });
            
            await fs.writeFile(imagePath, response.data);
            downloadCount++;
            console.log(chalk.green(`✅ Downloaded image: ${safeFilename}`));
          } catch (downloadError) {
            console.error(chalk.red(`❌ Failed to download image: ${downloadError.message}`));
            // Continue with the next image
            continue;
          }
        } else {
          console.log(chalk.blue(`⏩ Using existing image: ${safeFilename}`));
        }
        
        // Replace the URL in the HTML with the relative path
        processedHtml = processedHtml.replace(
          new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          imageRelativePath
        );
        
        console.log(chalk.blue(`🔄 Replaced URL with: ${imageRelativePath}`));
        
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to process attachment image ${filename}: ${error.message}`));
      }
    }
    
    console.log(chalk.blue(`📊 Attachment processing summary: ${downloadCount} images downloaded/updated`));
    return processedHtml;
  }

  /**
   * Process embedded images (data URLs)
   * @param {string} html - HTML content
   * @param {string} imagesDir - Directory to save images
   * @param {string} targetDir - Target directory of the markdown file
   * @returns {Promise<string>} - HTML with processed embedded images
   */
  async processEmbeddedImages(html, imagesDir, targetDir) {
    // Find all data URLs
    const dataUrlRegex = /src="(data:image\/([a-zA-Z0-9]+);base64,[^"]+)"/g;
    let match;
    let processedHtml = html;
    let counter = 0;
    
    console.log(chalk.blue(`🔍 Searching for embedded images (data URLs)...`));
    
    while ((match = dataUrlRegex.exec(html)) !== null) {
      const [fullMatch, dataUrl, imageType] = match;
      
      try {
        // Generate a filename for the embedded image
        counter++;
        const filename = `embedded-image-${Date.now()}-${counter}.${imageType}`;
        const imagePath = path.join(imagesDir, filename);
        const imageRelativePath = `images/${filename}`;
        
        console.log(chalk.blue(`📥 Extracting embedded image: ${filename}`));
        
        // Extract base64 data and save as file
        try {
          const base64Data = dataUrl.split(',')[1];
          if (!base64Data) {
            console.warn(chalk.yellow(`⚠️ Invalid data URL format`));
            continue;
          }
          
          await fs.writeFile(imagePath, Buffer.from(base64Data, 'base64'));
          console.log(chalk.green(`✅ Saved embedded image: ${filename}`));
          
          // Replace the data URL with the file path
          processedHtml = processedHtml.replace(
            new RegExp(dataUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
            imageRelativePath
          );
          
          console.log(chalk.blue(`🔄 Replaced data URL with: ${imageRelativePath}`));
        } catch (extractError) {
          console.error(chalk.red(`❌ Failed to extract embedded image: ${extractError.message}`));
          continue;
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to process embedded image: ${error.message}`));
      }
    }
    
    console.log(chalk.blue(`📊 Embedded image processing summary: ${counter} images extracted`));
    return processedHtml;
  }

  /**
   * Process Confluence content images (non-attachment)
   * @param {string} html - HTML content
   * @param {string} imagesDir - Directory to save images
   * @param {string} targetDir - Target directory of the markdown file
   * @param {string} pageId - Confluence page ID
   * @returns {Promise<string>} - HTML with processed content images
   */
  async processContentImages(html, imagesDir, targetDir, pageId) {
    // Find all image tags that aren't attachments or data URLs
    const imgRegex = /<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/g;
    let match;
    let processedHtml = html;
    let downloadCount = 0;
    
    console.log(chalk.blue(`🔍 Searching for external images...`));
    
    while ((match = imgRegex.exec(html)) !== null) {
      const [fullMatch, url] = match;
      
      // Skip if it's an attachment or data URL (already processed)
      if (url.includes('/download/attachments/') || url.includes('/attachments/') || 
          url.includes('/thumbnails/') || url.startsWith('data:')) {
        continue;
      }
      
      try {
        console.log(chalk.blue(`🔗 Found external image URL: ${url}`));
        
        // Generate a filename from the URL
        let filename;
        try {
          const urlObj = new URL(url);
          const urlPath = urlObj.pathname;
          const originalFilename = path.basename(urlPath);
          
          // Ensure the filename has an extension
          filename = originalFilename;
          if (!path.extname(filename) || path.extname(filename) === '.') {
            // Try to determine extension from URL or default to .png
            const extMatch = url.match(/\.(jpg|jpeg|png|gif|svg|webp)/i);
            filename += extMatch ? `.${extMatch[1].toLowerCase()}` : '.png';
          }
          
          // Clean the filename
          filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        } catch (urlError) {
          // If URL parsing fails, use a generic filename
          filename = `external-image-${Date.now()}-${downloadCount}.png`;
        }
        
        // Ensure unique filename
        const uniqueFilename = `external-${Date.now()}-${downloadCount}-${filename}`;
        const imagePath = path.join(imagesDir, uniqueFilename);
        const imageRelativePath = `images/${uniqueFilename}`;
        
        console.log(chalk.blue(`📥 Downloading external image: ${uniqueFilename}`));
        
        try {
          const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            timeout: 10000, // 10 second timeout
            maxContentLength: 10 * 1024 * 1024, // 10MB max
          });
          
          await fs.writeFile(imagePath, response.data);
          downloadCount++;
          console.log(chalk.green(`✅ Downloaded external image: ${uniqueFilename}`));
          
          // Replace the URL in the HTML
          processedHtml = processedHtml.replace(
            new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            imageRelativePath
          );
          
          console.log(chalk.blue(`🔄 Replaced URL with: ${imageRelativePath}`));
        } catch (downloadError) {
          console.error(chalk.red(`❌ Failed to download external image: ${downloadError.message}`));
          // Continue with the next image
          continue;
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to process external image: ${error.message}`));
      }
    }
    
    console.log(chalk.blue(`📊 External image processing summary: ${downloadCount} images downloaded`));
    return processedHtml;
  }

  /**
   * Post-process the converted markdown to fix any issues
   * @param {string} markdown - Converted markdown
   * @returns {string} - Post-processed markdown
   */
  postprocessMarkdown(markdown) {
    let processed = markdown;
    
    // Fix extra line breaks
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // Fix code blocks (ensure proper spacing)
    processed = processed.replace(/```(.*?)\n(.*?)```/gs, '```$1\n$2\n```');
    
    // Fix lists (ensure proper spacing)
    processed = processed.replace(/(\n[*-] .*?)(\n[*-] )/g, '$1\n$2');
    
    return processed;
  }
}

module.exports = HtmlToMarkdownParser; 