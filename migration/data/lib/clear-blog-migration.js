const { openBlogCategoriesDb, openBlogPostsDb } = require('./blog-db')

async function clearBlogMigrationData (params) {
  const openedCategories = await openBlogCategoriesDb(params)
  try {
    const categoryResult = await openedCategories.collection.deleteMany({ type: 'blog_category' })
    const openedPosts = await openBlogPostsDb(params)
    try {
      const postResult = await openedPosts.collection.deleteMany({ type: 'blog_post' })
      return {
        categoriesRemoved: categoryResult.deletedCount || 0,
        postsRemoved: postResult.deletedCount || 0
      }
    } finally {
      await openedPosts.client.close()
    }
  } finally {
    await openedCategories.client.close()
  }
}

module.exports = {
  clearBlogMigrationData
}
