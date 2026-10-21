const { openBlogCategoriesDb, openBlogTagsDb, openBlogPostsDb } = require('./blog-db')

/**
 * Write-mode cleanup for blog migration. Only deletes collections matching enabled datasets.
 * @param {object} params — Runtime / DB params
 * @param {{ categories?: boolean, tags?: boolean, posts?: boolean }} scope
 */
async function clearBlogMigrationData (params, scope = {}) {
  const result = {
    categoriesRemoved: 0,
    tagsRemoved: 0,
    postsRemoved: 0
  }

  if (scope.categories) {
    const opened = await openBlogCategoriesDb(params)
    try {
      const deleteResult = await opened.collection.deleteMany({ type: 'blog_category' })
      result.categoriesRemoved = deleteResult.deletedCount || 0
    } finally {
      await opened.client.close()
    }
  }

  if (scope.tags) {
    const opened = await openBlogTagsDb(params)
    try {
      const deleteResult = await opened.collection.deleteMany({ type: 'blog_tag' })
      result.tagsRemoved = deleteResult.deletedCount || 0
    } finally {
      await opened.client.close()
    }
  }

  if (scope.posts) {
    const opened = await openBlogPostsDb(params)
    try {
      const deleteResult = await opened.collection.deleteMany({ type: 'blog_post' })
      result.postsRemoved = deleteResult.deletedCount || 0
    } finally {
      await opened.client.close()
    }
  }

  return result
}

module.exports = {
  clearBlogMigrationData
}
