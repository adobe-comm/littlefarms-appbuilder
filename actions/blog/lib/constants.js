const POSTS_COLLECTION = 'littlefarms_blog_posts'
const CATEGORIES_COLLECTION = 'littlefarms_blog_categories'
const TAGS_COLLECTION = 'littlefarms_blog_tags'

const PAGE_SIZES = [20, 30, 50, 100]
const DEFAULT_PAGE_SIZE = 20
const MAX_POSTS = 10000

const POST_STATUSES = ['draft', 'published']

const IMAGE_KINDS = ['featured_image', 'mobile_image', 'listing_image']
const CATEGORY_DISPLAY_MODES = ['blog_posts_only', 'static_block_only', 'posts_and_static_block']

module.exports = {
  POSTS_COLLECTION,
  CATEGORIES_COLLECTION,
  TAGS_COLLECTION,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  MAX_POSTS,
  POST_STATUSES,
  IMAGE_KINDS,
  CATEGORY_DISPLAY_MODES
}
