const axios = require('axios');
const chalk = require('chalk');

class ConfluenceClient {
  constructor(config) {
    this.config = config;
    this.api = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${config.username}:${config.apiToken}`).toString('base64')}`
      }
    });
  }

  /**
   * Test connection to Confluence
   */
  async testConnection() {
    try {
      const response = await this.api.get(`/wiki/rest/api/space/${this.config.spaceKey}`);
      console.log(chalk.green('✓ Connected to Confluence space:', response.data.name));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Confluence connection failed:', error.response?.data?.message || error.message));
      return false;
    }
  }

  /**
   * Create hoặc update page
   * @param {Object} pageData - {title, content, parentId}
   */
  async createOrUpdatePage(pageData) {
    const { title, content, parentId } = pageData;

    try {
      // Check if page exists
      const existingPage = await this.findPageByTitle(title);

      if (existingPage) {
        console.log(chalk.yellow('📝 Updating existing page:', title));
        const version = existingPage.version?.number || 1;
        return await this.updatePage(existingPage.id, title, content, version + 1);
      } else {
        console.log(chalk.green('📄 Creating new page:', title));
        return await this.createPage(title, content, parentId);
      }
    } catch (error) {
      throw new Error(`Failed to sync page "${title}": ${error.message}`);
    }
  }

  /**
   * Find page by title trong space
   */
  async findPageByTitle(title) {
    try {
      const response = await this.api.get('/wiki/rest/api/content', {
        params: {
          spaceKey: this.config.spaceKey,
          title: title,
          type: 'page',
          expand: 'version'
        }
      });

      return response.data.results.length > 0 ? response.data.results[0] : null;
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Could not search for existing page:', error.response?.data?.message || error.message));
      return null;
    }
  }

  /**
   * Create new page
   */
  async createPage(title, content, parentId) {
    const pageData = {
      type: 'page',
      title: title,
      space: { key: this.config.spaceKey },
      body: {
        storage: {
          value: content,
          representation: 'storage'
        }
      },
      version: { number: 1 }
    };

    // Add parent if specified
    if (parentId) {
      pageData.ancestors = [{ id: parentId }];
    }

    const response = await this.api.post('/wiki/rest/api/content', pageData);
    return response.data;
  }

  /**
   * Update existing page
   */
  async updatePage(pageId, title, content, version) {
    const pageData = {
      type: 'page',
      title: title,
      space: { key: this.config.spaceKey },
      body: {
        storage: {
          value: content,
          representation: 'storage'
        }
      },
      version: { number: version }
    };

    const response = await this.api.put(`/wiki/rest/api/content/${pageId}`, pageData);
    return response.data;
  }

  /**
   * Get a page by its ID
   * @param {string} pageId - The ID of the page to retrieve.
   * @param {string} expand - A comma-separated list of properties to expand (e.g., 'body.storage,version').
   */
  async getPageById(pageId, expand = null) {
    try {
      const params = {
        expand: expand || 'body.storage,version'
      };
      const response = await this.api.get(`/wiki/rest/api/content/${pageId}`, { params });
      return response.data;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to get page with ID ${pageId}:`, error.response?.data?.message || error.message));
      // Rethrow to allow the calling function to handle the failure
      throw new Error(`Could not fetch page with ID ${pageId}.`);
    }
  }

  /**
   * Get page history to check for updates
   * @param {string} pageId - The ID of the page
   * @returns {Promise<Array>} - Array of page versions
   */
  async getPageHistory(pageId) {
    try {
      const response = await this.api.get(`/wiki/rest/api/content/${pageId}/history`, {
        params: {
          expand: 'history.lastUpdated'
        }
      });
      
      return response.data;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not get page history: ${error.response?.data?.message || error.message}`));
      return null;
    }
  }

  /**
   * Get root page by title
   */
  async getRootPage() {
    if (!this.config.rootPageTitle) {
      return null;
    }

    return await this.findPageByTitle(this.config.rootPageTitle);
  }

  /**
   * Find or create parent page for category
   */
  async findOrCreateParentPage(categoryPath, rootParentId = null) {
    if (!categoryPath) {
      return rootParentId;
    }

    // Split category path into segments (e.g., "advanced/concepts" -> ["advanced", "concepts"])
    const segments = categoryPath.split('/').filter(Boolean);
    let currentParentId = rootParentId;
    let pathSoFar = '';
    
    for (const [index, segment] of segments.entries()) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
      
      // Generate readable title from segment
      const title = this.formatCategoryTitle(segment);
      
      // Try to find existing page with specific parent context
      let page = await this.findPageByTitleAndParent(title, currentParentId);
      
      if (!page) {
        // Create new parent page
        const level = '  '.repeat(index);
        console.log(chalk.blue(`${level}📁 Creating parent page: ${title} (${pathSoFar})`));
        
        const pageData = {
          title: title,
          content: `<p>This page contains documentation for <strong>${title}</strong>.</p>
                   <p><em>Category path: ${pathSoFar}</em></p>`,
          parentId: currentParentId
        };
        
        page = await this.createOrUpdatePage(pageData);
      }
      
      currentParentId = page.id;
    }
    
    return currentParentId;
  }

  /**
   * Find page by title within specific parent context
   */
  async findPageByTitleAndParent(title, parentId) {
    try {
      if (!parentId) {
        return await this.findPageByTitle(title);
      }
      
      // Get all children of the parent page
      const children = await this.getPageChildren(parentId);
      
      // Find child with matching title
      return children.find(child => child.title === title);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not find page by title and parent: ${error.message}`));
      return null;
    }
  }

  /**
   * Format category title
   */
  formatCategoryTitle(segment) {
    return segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Get children of a page
   */
  async getPageChildren(pageId) {
    try {
      const response = await this.api.get(`/wiki/rest/api/content/${pageId}/child/page`, {
        params: {
          expand: 'version'
        }
      });
      
      return response.data.results || [];
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not get page children: ${error.response?.data?.message || error.message}`));
      return [];
    }
  }

  /**
   * Get all attachments for a page
   * @param {string} pageId - The ID of the page
   * @returns {Promise<Array>} - Array of attachment objects
   */
  async getPageAttachments(pageId) {
    try {
      const response = await this.api.get(`/wiki/rest/api/content/${pageId}/child/attachment`, {
        params: {
          expand: 'metadata,version',
          limit: 200 // Get up to 200 attachments
        }
      });
      
      return response.data.results || [];
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not get page attachments: ${error.response?.data?.message || error.message}`));
      return [];
    }
  }

  /**
   * Get attachment download URL
   * @param {Object} attachment - Attachment object from getPageAttachments
   * @returns {string} - Full download URL
   */
  getAttachmentDownloadUrl(attachment) {
    if (!attachment || !attachment._links || !attachment._links.download) {
      return null;
    }
    
    // The download link is relative, so we need to prepend the base URL
    const downloadPath = attachment._links.download;
    return `${this.config.baseUrl}/wiki/${downloadPath}`;
  }

  /**
   * Download attachment content
   * @param {string} downloadUrl - Full download URL
   * @returns {Promise<Buffer>} - Attachment content as buffer
   */
  async downloadAttachment(downloadUrl) {
    try {
      const response = await this.api.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout for large files
        maxContentLength: 50 * 1024 * 1024 // 50MB max
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error(chalk.red(`❌ Failed to download attachment: ${error.response?.data?.message || error.message}`));
      throw new Error(`Could not download attachment: ${error.message}`);
    }
  }

  /**
   * Get page with attachments metadata
   * @param {string} pageId - The ID of the page
   * @returns {Promise<Object>} - Page object with attachments array
   */
  async getPageWithAttachments(pageId) {
    try {
      // Get page content
      const page = await this.getPageById(pageId, 'body.storage,version');
      
      // Get attachments
      const attachments = await this.getPageAttachments(pageId);
      
      // Add attachments to page object
      page.attachments = attachments;
      
      return page;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to get page with attachments: ${error.message}`));
      throw error;
    }
  }
}

module.exports = ConfluenceClient; 