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
  constructor(projectRoot, confluenceClient = null) {
    this.projectRoot = projectRoot;
    this.confluenceClient = confluenceClient;
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
   * @param {Array} attachments - Array of attachment objects from Confluence API
   * @returns {Promise<string>} - Markdown content
   */
  async convertToMarkdown(htmlContent, pageId, targetFilePath, attachments = []) {
    try {
      console.log(chalk.blue('🔄 Processing Confluence content...'));
      
      // Process Confluence storage format to make it more HTML-like
      let processedHtml = this.preprocessConfluenceHtml(htmlContent);
      
      // Download and save any images using attachment metadata
      console.log(chalk.blue('🖼️ Processing images with attachment data...'));
      processedHtml = await this.processImagesWithAttachments(processedHtml, pageId, targetFilePath, attachments);
      
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
    
    // Replace Confluence image tags with attachment references
    processed = processed.replace(/<ac:image[^>]*>(.*?)<\/ac:image>/gs, (match, content) => {
      // Check for attachment reference
      const attachmentMatch = content.match(/<ri:attachment\s+ri:filename="([^"]+)"[^>]*\/>/);
      if (attachmentMatch) {
        const filename = attachmentMatch[1];
        // Keep the original structure for later processing
        return match; // Will be processed by processConfluenceAttachmentReferences
      }
      
      // Check for URL reference
      const urlMatch = content.match(/<ri:url\s+ri:value="([^"]+)"[^>]*\/>/);
      if (urlMatch) {
        const url = urlMatch[1];
        return `<img src="${url}" alt="Confluence Image" />`;
      }
      
      // Extract other image attributes if available
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
   * Process images using Confluence attachment metadata
   * @param {string} html - HTML content
   * @param {string} pageId - Confluence page ID
   * @param {string} targetFilePath - Target file path
   * @param {Array} attachments - Array of attachment objects from Confluence API
   * @returns {Promise<string>} - HTML with processed images
   */
  async processImagesWithAttachments(html, pageId, targetFilePath, attachments = []) {
    try {
      // Create directory for images if it doesn't exist
      const targetDir = path.dirname(targetFilePath);
      const imagesDir = path.join(targetDir, 'images');
      
      console.log(chalk.blue(`📁 Creating images directory: ${imagesDir}`));
      await fs.ensureDir(imagesDir);
      
      let processedHtml = html;
      
      // Create a map of attachments by filename for quick lookup
      const attachmentMap = new Map();
      attachments.forEach(attachment => {
        if (attachment.title && this.isImageFile(attachment.title)) {
          attachmentMap.set(attachment.title, attachment);
          // Also map by ID if available
          if (attachment.id) {
            attachmentMap.set(attachment.id, attachment);
          }
        }
      });
      
      console.log(chalk.blue(`📊 Found ${attachmentMap.size} image attachments`));
      
      // Process Confluence attachment references in HTML
      processedHtml = await this.processConfluenceAttachmentReferences(processedHtml, attachmentMap, imagesDir);
      
      // Process traditional attachment URLs (fallback)
      processedHtml = await this.processAttachmentImages(processedHtml, imagesDir, targetDir);
      
      // Process embedded images (data URLs)
      processedHtml = await this.processEmbeddedImages(processedHtml, imagesDir, targetDir);
      
      // Process external images
      processedHtml = await this.processContentImages(processedHtml, imagesDir, targetDir, pageId);
      
      console.log(chalk.green(`✅ Image processing with attachments complete`));
      return processedHtml;
    } catch (error) {
      console.error(chalk.red(`❌ Error processing images with attachments: ${error.message}`));
      // Fallback to original method
      return await this.processImages(html, pageId, targetFilePath);
    }
  }

  /**
   * Process Confluence attachment references using attachment metadata
   * @param {string} html - HTML content
   * @param {Map} attachmentMap - Map of attachment filename/id to attachment object
   * @param {string} imagesDir - Directory to save images
   * @returns {Promise<string>} - HTML with processed attachment references
   */
  async processConfluenceAttachmentReferences(html, attachmentMap, imagesDir) {
    let processedHtml = html;
    let downloadCount = 0;
    
    // Pattern 1: Confluence storage format attachment references
    // <ac:image><ri:attachment ri:filename="image.png" /></ac:image>
    const storageAttachmentRegex = /<ac:image[^>]*>.*?<ri:attachment\s+ri:filename="([^"]+)"[^>]*\/>.*?<\/ac:image>/g;
    let match;
    
    console.log(chalk.blue(`🔍 Processing Confluence storage format attachments...`));
    
    while ((match = storageAttachmentRegex.exec(html)) !== null) {
      const [fullMatch, filename] = match;
      
      if (attachmentMap.has(filename)) {
        const attachment = attachmentMap.get(filename);
        console.log(chalk.blue(`🔍 Processing Confluence storage format attachment: ${JSON.stringify(attachment)}`));
        const processedImage = await this.downloadAndSaveAttachment(attachment, filename, imagesDir);
        
        if (processedImage) {
          // Replace the Confluence storage format with standard img tag
          processedHtml = processedHtml.replace(fullMatch, `<img src="${processedImage.relativePath}" alt="${processedImage.alt}" />`);
          downloadCount++;
          console.log(chalk.green(`✅ Processed storage format attachment: ${filename}`));
        }
      } else {
        console.warn(chalk.yellow(`⚠️ Attachment not found in metadata: ${filename}`));
      }
    }
    
    // Pattern 2: Direct attachment URLs in img tags
    // <img src="/wiki/download/attachments/123456/image.png" />
    const attachmentUrlRegex = /<img[^>]+src="([^"]*\/(?:download\/)?attachments?\/\d+\/([^"?]+)(?:\?[^"]*)?)"[^>]*>/g;
    
    console.log(chalk.blue(`🔍 Processing direct attachment URLs...`));
    
    while ((match = attachmentUrlRegex.exec(html)) !== null) {
      const [fullMatch, url, filename] = match;
      
      if (attachmentMap.has(filename)) {
        const attachment = attachmentMap.get(filename);
        const processedImage = await this.downloadAndSaveAttachment(attachment, filename, imagesDir);
        
        if (processedImage) {
          // Replace the URL with the local path
          processedHtml = processedHtml.replace(
            new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            processedImage.relativePath
          );
          downloadCount++;
          console.log(chalk.green(`✅ Processed attachment URL: ${filename}`));
        }
      } else {
        console.warn(chalk.yellow(`⚠️ Attachment not found in metadata: ${filename}`));
        // Fallback to downloading directly from URL if possible
        try {
          const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
          const imagePath = path.join(imagesDir, safeFilename);
          const imageRelativePath = `images/${safeFilename}`;
          
          if (this.confluenceClient) {
            console.log(chalk.blue(`📥 Attempting direct download: ${filename}`));
            const fullUrl = url.startsWith('http') ? url : `${this.confluenceClient.config.baseUrl}${url}`;
            const buffer = await this.confluenceClient.downloadAttachment(fullUrl);
            await fs.writeFile(imagePath, buffer);
            
            processedHtml = processedHtml.replace(
              new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              imageRelativePath
            );
            downloadCount++;
            console.log(chalk.green(`✅ Downloaded via direct URL: ${filename}`));
          }
        } catch (directDownloadError) {
          console.warn(chalk.yellow(`⚠️ Failed to download directly: ${directDownloadError.message}`));
        }
      }
    }
    
    console.log(chalk.blue(`📊 Attachment processing summary: ${downloadCount} attachments processed`));
    return processedHtml;
  }

  /**
   * Download and save an attachment using Confluence API
   * @param {Object} attachment - Attachment object from Confluence API
   * @param {string} filename - Original filename
   * @param {string} imagesDir - Directory to save images
   * @returns {Promise<Object|null>} - Object with relativePath and alt, or null if failed
   */
  async downloadAndSaveAttachment(attachment, filename, imagesDir) {
    try {
      if (!this.confluenceClient) {
        console.warn(chalk.yellow(`⚠️ No Confluence client available for downloading: ${filename}`));
        return null;
      }
      
      // Create safe filename
      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const imagePath = path.join(imagesDir, safeFilename);
      const imageRelativePath = `images/${safeFilename}`;
      
      // Check if file already exists and is recent
      if (await fs.pathExists(imagePath)) {
        const stats = await fs.stat(imagePath);
        const attachmentDate = new Date(attachment.version?.when || attachment.metadata?.createdDate || 0);
        
        if (stats.mtime >= attachmentDate) {
          console.log(chalk.blue(`⏩ Using existing file: ${safeFilename}`));
          return {
            relativePath: imageRelativePath,
            alt: attachment.title || filename
          };
        }
      }
      
      // Get download URL
      const downloadUrl = this.confluenceClient.getAttachmentDownloadUrl(attachment);
      if (!downloadUrl) {
        console.warn(chalk.yellow(`⚠️ No download URL available for: ${filename}`));
        return null;
      }
      
      console.log(chalk.blue(`📥 Downloading attachment: ${filename}`));
      
      // Download the attachment
      const buffer = await this.confluenceClient.downloadAttachment(downloadUrl);
      await fs.writeFile(imagePath, buffer);
      
      console.log(chalk.green(`✅ Downloaded: ${safeFilename} (${buffer.length} bytes)`));
      
      return {
        relativePath: imageRelativePath,
        alt: attachment.title || filename
      };
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to download attachment ${filename}: ${error.message}`));
      return null;
    }
  }

  /**
   * Check if file is an image based on extension
   * @param {string} filename - Filename to check
   * @returns {boolean} - True if it's an image file
   */
  isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.tiff'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
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