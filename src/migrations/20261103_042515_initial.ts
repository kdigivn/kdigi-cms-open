import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('vi', 'en');
  CREATE TYPE "public"."enum_users_role" AS ENUM('super-admin', 'admin', 'editor', 'author');
  CREATE TYPE "public"."enum_sites_contact_right_side_icon" AS ENUM('facebook', 'phone', 'zalo', 'map');
  CREATE TYPE "public"."enum_sites_page_group_key" AS ENUM('FRONT_PAGE', 'BLOG', 'PROFILE', 'CONTACT', 'ABOUT', 'SEARCH', 'SIGN_IN', 'SIGN_UP', 'FORGOT_PASSWORD', 'CONFIRM_EMAIL', 'PASSWORD_CHANGE', 'TERM_CONDITION', 'PRIVACY_POLICY');
  CREATE TYPE "public"."enum_sites_knowledge_graph_opening_hours_day_of_week" AS ENUM('Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su');
  CREATE TYPE "public"."enum_sites_knowledge_graph_area_served_type" AS ENUM('City', 'AdministrativeArea', 'Country');
  CREATE TYPE "public"."enum_sites_knowledge_graph_knows_language" AS ENUM('vi', 'en', 'fr', 'ko', 'zh');
  CREATE TYPE "public"."enum_sites_knowledge_graph_contact_point_available_language" AS ENUM('vi', 'en');
  CREATE TYPE "public"."enum_sites_social_profiles_platform" AS ENUM('Facebook', 'YouTube', 'Zalo', 'X', 'Instagram', 'TikTok', 'LinkedIn', 'Other');
  CREATE TYPE "public"."enum_sites_default_language" AS ENUM('vi', 'en');
  CREATE TYPE "public"."enum_sites_theme" AS ENUM('light', 'dark', 'brand-red', 'brand-blue', 'brand-green');
  CREATE TYPE "public"."enum_sites_landing_hero_notice1_icon" AS ENUM('thunderbolt', 'shield', 'ticket', 'clock', 'payment', 'check', 'support', 'location');
  CREATE TYPE "public"."enum_sites_landing_hero_notice2_icon" AS ENUM('thunderbolt', 'shield', 'ticket', 'clock', 'payment', 'check', 'support', 'location');
  CREATE TYPE "public"."enum_sites_knowledge_graph_type" AS ENUM('Organization', 'Person');
  CREATE TYPE "public"."enum_sites_knowledge_graph_business_type" AS ENUM('Organization', 'LocalBusiness', 'ProfessionalService', 'Store', 'Restaurant');
  CREATE TYPE "public"."enum_sites_knowledge_graph_contact_point_contact_type" AS ENUM('customer support', 'sales', 'reservations');
  CREATE TYPE "public"."enum_sites_seo_titles_separator" AS ENUM('|', '-', '·', '»', '~', '—');
  CREATE TYPE "public"."enum_sites_breadcrumbs_primary_taxonomy_product" AS ENUM('none', 'product-category', 'category', 'tag');
  CREATE TYPE "public"."enum_sites_breadcrumbs_primary_taxonomy_post" AS ENUM('none', 'product-category', 'category', 'tag');
  CREATE TYPE "public"."enum_sites_manifest_display" AS ENUM('standalone', 'fullscreen', 'minimal-ui', 'browser');
  CREATE TYPE "public"."enum_taxonomies_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum_taxonomies_type" AS ENUM('category', 'product-category', 'tag', 'custom');
  CREATE TYPE "public"."enum_taxonomies_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum__taxonomies_v_version_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum__taxonomies_v_version_type" AS ENUM('category', 'product-category', 'tag', 'custom');
  CREATE TYPE "public"."enum__taxonomies_v_version_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum_menus_location" AS ENUM('PRIMARY', 'SECONDARY_MENU', 'MOBILE_MENU', 'FOOTER_MENU', 'LOGGEDIN_ACCOUNT_MENU');
  CREATE TYPE "public"."enum_pages_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_pages_page_type" AS ENUM('default', 'blog', 'landing');
  CREATE TYPE "public"."enum_pages_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum__pages_v_version_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_page_type" AS ENUM('default', 'blog', 'landing');
  CREATE TYPE "public"."enum__pages_v_version_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum_posts_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum_posts_type" AS ENUM('blog', 'news', 'guide');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_posts_tier" AS ENUM('1', '2', '3');
  CREATE TYPE "public"."enum_posts_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum__posts_v_version_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum__posts_v_version_type" AS ENUM('blog', 'news', 'guide');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_tier" AS ENUM('1', '2', '3');
  CREATE TYPE "public"."enum__posts_v_version_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum_comments_status" AS ENUM('pending', 'approved', 'spam');
  CREATE TYPE "public"."enum_products_prices_currency" AS ENUM('VND', 'USD', 'EUR', 'GBP', 'JPY');
  CREATE TYPE "public"."enum_products_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_products_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum__products_v_version_prices_currency" AS ENUM('VND', 'USD', 'EUR', 'GBP', 'JPY');
  CREATE TYPE "public"."enum__products_v_version_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_version_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum_landings_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum_landings_blocks_cta_style" AS ENUM('primary', 'secondary', 'outline');
  CREATE TYPE "public"."enum_landings_blocks_divider_style" AS ENUM('solid', 'dashed', 'dotted');
  CREATE TYPE "public"."enum_landings_blocks_divider_spacing" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "public"."enum_landings_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum_landings_template" AS ENUM('default', 'wide', 'fullscreen');
  CREATE TYPE "public"."enum_landings_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum_landings_schema_type" AS ENUM('WebPage', 'FAQPage', 'Article', 'Product', 'Event');
  CREATE TYPE "public"."enum__landings_v_version_seo_robots" AS ENUM('index', 'follow', 'noindex', 'nofollow', 'max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  CREATE TYPE "public"."enum__landings_v_blocks_cta_style" AS ENUM('primary', 'secondary', 'outline');
  CREATE TYPE "public"."enum__landings_v_blocks_divider_style" AS ENUM('solid', 'dashed', 'dotted');
  CREATE TYPE "public"."enum__landings_v_blocks_divider_spacing" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "public"."enum__landings_v_version_status" AS ENUM('draft', 'published', 'archived');
  CREATE TYPE "public"."enum__landings_v_version_template" AS ENUM('default', 'wide', 'fullscreen');
  CREATE TYPE "public"."enum__landings_v_version_seo_open_graph_twitter_meta_card" AS ENUM('summary', 'summary_large_image');
  CREATE TYPE "public"."enum__landings_v_version_schema_type" AS ENUM('WebPage', 'FAQPage', 'Article', 'Product', 'Event');
  CREATE TYPE "public"."enum_redirects_status_code" AS ENUM('301', '302');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'revalidateFrontend');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'revalidateFrontend');
  CREATE TYPE "public"."enum_payload_folders_folder_type" AS ENUM('media');
  CREATE TABLE "users_tenants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_users_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"tenant_id" integer,
  	"external_url" varchar,
  	"version" numeric DEFAULT 1,
  	"_objectkey" varchar,
  	"folder_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "sites_landing_slider" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"alt" varchar,
  	"link" varchar,
  	"order" numeric
  );
  
  CREATE TABLE "sites_home_page_highlight" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer
  );
  
  CREATE TABLE "sites_home_page_highlight_locales" (
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "sites_contact_right_side" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon" "enum_sites_contact_right_side_icon",
  	"value" varchar,
  	"url" varchar,
  	"is_visible" boolean DEFAULT true
  );
  
  CREATE TABLE "sites_contact_right_side_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "sites_contact_header_icons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"icon" varchar
  );
  
  CREATE TABLE "sites_contact_header_icons_locales" (
  	"tooltip" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "sites_footer_address" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"link" varchar
  );
  
  CREATE TABLE "sites_footer_ecosystem_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"logo_id" integer
  );
  
  CREATE TABLE "sites_footer_ecosystem_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "sites_footer_partners" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"url" varchar,
  	"logo_id" integer
  );
  
  CREATE TABLE "sites_page_group" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" "enum_sites_page_group_key" NOT NULL
  );
  
  CREATE TABLE "sites_page_group_locales" (
  	"page_slug" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "sites_knowledge_graph_opening_hours_day_of_week" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_sites_knowledge_graph_opening_hours_day_of_week",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "sites_knowledge_graph_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"opens" varchar,
  	"closes" varchar
  );
  
  CREATE TABLE "sites_knowledge_graph_founders" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL
  );
  
  CREATE TABLE "sites_knowledge_graph_area_served" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_sites_knowledge_graph_area_served_type" DEFAULT 'City',
  	"name" varchar NOT NULL
  );
  
  CREATE TABLE "sites_knowledge_graph_knows_language" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sites_knowledge_graph_knows_language",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "sites_knowledge_graph_contact_point_available_language" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sites_knowledge_graph_contact_point_available_language",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "sites_knowledge_graph_additional_offices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"address" varchar,
  	"geo_latitude" numeric,
  	"geo_longitude" numeric,
  	"telephone" varchar,
  	"opening_hours" varchar,
  	"gbp_place_id" varchar
  );
  
  CREATE TABLE "sites_social_profiles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_sites_social_profiles_platform",
  	"url" varchar
  );
  
  CREATE TABLE "sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_key" varchar NOT NULL,
  	"domain" varchar NOT NULL,
  	"default_language" "enum_sites_default_language" DEFAULT 'vi' NOT NULL,
  	"r2_bucket" varchar,
  	"r2_public_base_url" varchar,
  	"r2_account_id" varchar,
  	"r2_access_key_id" varchar,
  	"r2_secret_access_key" varchar,
  	"r2_compress_to_webp" boolean DEFAULT false,
  	"r2_webp_quality" numeric DEFAULT 80,
  	"theme" "enum_sites_theme" DEFAULT 'light',
  	"branding_primary_color" varchar,
  	"branding_font_family" varchar,
  	"branding_logo_id" integer,
  	"branding_favicon_id" integer,
  	"branding_not_found_image_id" integer,
  	"landing_hero_notice1_icon" "enum_sites_landing_hero_notice1_icon" DEFAULT 'thunderbolt',
  	"landing_hero_notice2_icon" "enum_sites_landing_hero_notice2_icon" DEFAULT 'shield',
  	"sidebar_payment_qr_id" integer,
  	"sidebar_html" varchar,
  	"seo_defaults_og_image_id" integer,
  	"knowledge_graph_type" "enum_sites_knowledge_graph_type" DEFAULT 'Organization',
  	"knowledge_graph_business_type" "enum_sites_knowledge_graph_business_type" DEFAULT 'Organization',
  	"knowledge_graph_logo_id" integer,
  	"knowledge_graph_email" varchar,
  	"knowledge_graph_telephone" varchar,
  	"knowledge_graph_price_range" varchar,
  	"knowledge_graph_address_street_address" varchar,
  	"knowledge_graph_address_address_locality" varchar,
  	"knowledge_graph_address_address_region" varchar,
  	"knowledge_graph_address_postal_code" varchar,
  	"knowledge_graph_address_address_country" varchar DEFAULT 'VN',
  	"knowledge_graph_geo_latitude" numeric,
  	"knowledge_graph_geo_longitude" numeric,
  	"knowledge_graph_founding_date" timestamp(3) with time zone,
  	"knowledge_graph_contact_point_telephone" varchar,
  	"knowledge_graph_contact_point_email" varchar,
  	"knowledge_graph_contact_point_contact_type" "enum_sites_knowledge_graph_contact_point_contact_type",
  	"knowledge_graph_contact_point_hours_available" varchar,
  	"knowledge_graph_return_policy_url" varchar,
  	"knowledge_graph_search_action_url" varchar,
  	"knowledge_graph_min_reviews_for_aggregate" numeric DEFAULT 10,
  	"knowledge_graph_gbp_place_id" varchar,
  	"knowledge_graph_gbp_map_embed" varchar,
  	"knowledge_graph_wikidata_id" varchar,
  	"knowledge_graph_wikipedia_url" varchar,
  	"knowledge_graph_youtube_channel_url" varchar,
  	"knowledge_graph_tiktok_url" varchar,
  	"knowledge_graph_telephone_e164" varchar,
  	"seo_titles_separator" "enum_sites_seo_titles_separator" DEFAULT '|',
  	"seo_titles_homepage_title_template" varchar DEFAULT '%sitename%',
  	"seo_titles_homepage_description_template" varchar DEFAULT '%excerpt%',
  	"seo_titles_posts_title_template" varchar DEFAULT '%title% %sep% %sitename%',
  	"seo_titles_posts_description_template" varchar DEFAULT '%excerpt%',
  	"seo_titles_pages_title_template" varchar DEFAULT '%title% %sep% %sitename%',
  	"seo_titles_pages_description_template" varchar DEFAULT '%excerpt%',
  	"seo_titles_products_title_template" varchar DEFAULT '%title% %sep% %sitename%',
  	"seo_titles_products_description_template" varchar DEFAULT '%excerpt%',
  	"seo_titles_landings_title_template" varchar DEFAULT '%title% %sep% %sitename%',
  	"seo_titles_landings_description_template" varchar DEFAULT '%excerpt%',
  	"seo_titles_taxonomies_title_template" varchar DEFAULT '%term% %sep% %sitename%',
  	"seo_titles_taxonomies_description_template" varchar DEFAULT '%excerpt%',
  	"breadcrumbs_primary_taxonomy_product" "enum_sites_breadcrumbs_primary_taxonomy_product" DEFAULT 'product-category',
  	"breadcrumbs_primary_taxonomy_post" "enum_sites_breadcrumbs_primary_taxonomy_post" DEFAULT 'category',
  	"integration_ga4_id" varchar,
  	"integration_gtm_id" varchar,
  	"integration_clarity_id" varchar,
  	"manifest_scope" varchar DEFAULT '/',
  	"manifest_start_url" varchar DEFAULT '/',
  	"manifest_display" "enum_sites_manifest_display" DEFAULT 'standalone',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sites_locales" (
  	"landing_hero_title" varchar,
  	"landing_hero_notice1" varchar,
  	"landing_hero_notice2" varchar,
  	"footer_subfooter" varchar,
  	"knowledge_graph_name" varchar,
  	"knowledge_graph_legal_name" varchar,
  	"knowledge_graph_description" varchar,
  	"manifest_name" varchar,
  	"manifest_short_name" varchar,
  	"manifest_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "sites_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer,
  	"products_id" integer
  );
  
  CREATE TABLE "taxonomies_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false
  );
  
  CREATE TABLE "taxonomies_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "taxonomies_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_taxonomies_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "taxonomies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"content_word_count" numeric,
  	"type" "enum_taxonomies_type" NOT NULL,
  	"slug" varchar NOT NULL,
  	"parent_id" integer,
  	"custom_type" varchar,
  	"seo_open_graph_image_id" integer,
  	"seo_open_graph_site_name" varchar,
  	"seo_open_graph_url" varchar,
  	"seo_open_graph_type" varchar DEFAULT 'website',
  	"seo_open_graph_locale" varchar,
  	"seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"seo_open_graph_twitter_meta_card" "enum_taxonomies_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"seo_open_graph_twitter_meta_image_id" integer,
  	"seo_canonical_override" varchar,
  	"seo_article_meta_published_time" timestamp(3) with time zone,
  	"seo_article_meta_modified_time" timestamp(3) with time zone,
  	"seo_updated_time" timestamp(3) with time zone,
  	"seo_json_ld_raw" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "taxonomies_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"content_md" varchar,
  	"content" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_open_graph_title" varchar,
  	"seo_open_graph_description" varchar,
  	"seo_open_graph_image_alt" varchar,
  	"seo_open_graph_twitter_meta_title" varchar,
  	"seo_open_graph_twitter_meta_description" varchar,
  	"seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "taxonomies_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_taxonomies_v_version_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_taxonomies_v_version_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_taxonomies_v_version_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__taxonomies_v_version_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_taxonomies_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_content_word_count" numeric,
  	"version_type" "enum__taxonomies_v_version_type" NOT NULL,
  	"version_slug" varchar NOT NULL,
  	"version_parent_id" integer,
  	"version_custom_type" varchar,
  	"version_seo_open_graph_image_id" integer,
  	"version_seo_open_graph_site_name" varchar,
  	"version_seo_open_graph_url" varchar,
  	"version_seo_open_graph_type" varchar DEFAULT 'website',
  	"version_seo_open_graph_locale" varchar,
  	"version_seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"version_seo_open_graph_twitter_meta_card" "enum__taxonomies_v_version_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"version_seo_open_graph_twitter_meta_image_id" integer,
  	"version_seo_canonical_override" varchar,
  	"version_seo_article_meta_published_time" timestamp(3) with time zone,
  	"version_seo_article_meta_modified_time" timestamp(3) with time zone,
  	"version_seo_updated_time" timestamp(3) with time zone,
  	"version_seo_json_ld_raw" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_taxonomies_v_locales" (
  	"version_name" varchar NOT NULL,
  	"version_description" varchar,
  	"version_content_md" varchar,
  	"version_content" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_open_graph_title" varchar,
  	"version_seo_open_graph_description" varchar,
  	"version_seo_open_graph_image_alt" varchar,
  	"version_seo_open_graph_twitter_meta_title" varchar,
  	"version_seo_open_graph_twitter_meta_description" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_taxonomies_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "authors_same_as" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"avatar_id" integer,
  	"email" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors_locales" (
  	"bio" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "menus_items_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"order" numeric DEFAULT 0
  );
  
  CREATE TABLE "menus_items_children_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "menus_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"order" numeric DEFAULT 0
  );
  
  CREATE TABLE "menus_items_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "menus" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"location" "enum_menus_location" NOT NULL,
  	"tree" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "faqs_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "faqs_items_locales" (
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "faqs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"group" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "_faqs_v_version_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_faqs_v_version_items_locales" (
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_faqs_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_group" varchar NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false
  );
  
  CREATE TABLE "pages_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_pages_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"status" "enum_pages_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"slug" varchar NOT NULL,
  	"page_type" "enum_pages_page_type" DEFAULT 'default',
  	"is_pillar_page" boolean DEFAULT false,
  	"featured_image_id" integer,
  	"sitemap_priority" numeric DEFAULT 0.6,
  	"seo_open_graph_image_id" integer,
  	"seo_open_graph_site_name" varchar,
  	"seo_open_graph_url" varchar,
  	"seo_open_graph_type" varchar DEFAULT 'website',
  	"seo_open_graph_locale" varchar,
  	"seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"seo_open_graph_twitter_meta_card" "enum_pages_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"seo_open_graph_twitter_meta_image_id" integer,
  	"seo_canonical_override" varchar,
  	"seo_article_meta_published_time" timestamp(3) with time zone,
  	"seo_article_meta_modified_time" timestamp(3) with time zone,
  	"seo_updated_time" timestamp(3) with time zone,
  	"seo_json_ld_raw" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar NOT NULL,
  	"content_md" varchar,
  	"content" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_open_graph_title" varchar,
  	"seo_open_graph_description" varchar,
  	"seo_open_graph_image_alt" varchar,
  	"seo_open_graph_twitter_meta_title" varchar,
  	"seo_open_graph_twitter_meta_description" varchar,
  	"seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"faqs_id" integer
  );
  
  CREATE TABLE "_pages_v_version_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_version_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_version_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__pages_v_version_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_status" "enum__pages_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_slug" varchar NOT NULL,
  	"version_page_type" "enum__pages_v_version_page_type" DEFAULT 'default',
  	"version_is_pillar_page" boolean DEFAULT false,
  	"version_featured_image_id" integer,
  	"version_sitemap_priority" numeric DEFAULT 0.6,
  	"version_seo_open_graph_image_id" integer,
  	"version_seo_open_graph_site_name" varchar,
  	"version_seo_open_graph_url" varchar,
  	"version_seo_open_graph_type" varchar DEFAULT 'website',
  	"version_seo_open_graph_locale" varchar,
  	"version_seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"version_seo_open_graph_twitter_meta_card" "enum__pages_v_version_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"version_seo_open_graph_twitter_meta_image_id" integer,
  	"version_seo_canonical_override" varchar,
  	"version_seo_article_meta_published_time" timestamp(3) with time zone,
  	"version_seo_article_meta_modified_time" timestamp(3) with time zone,
  	"version_seo_updated_time" timestamp(3) with time zone,
  	"version_seo_json_ld_raw" varchar,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_pages_v_locales" (
  	"version_title" varchar NOT NULL,
  	"version_content_md" varchar,
  	"version_content" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_open_graph_title" varchar,
  	"version_seo_open_graph_description" varchar,
  	"version_seo_open_graph_image_alt" varchar,
  	"version_seo_open_graph_twitter_meta_title" varchar,
  	"version_seo_open_graph_twitter_meta_description" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"faqs_id" integer
  );
  
  CREATE TABLE "posts_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false
  );
  
  CREATE TABLE "posts_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "posts_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_posts_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"type" "enum_posts_type" DEFAULT 'blog' NOT NULL,
  	"status" "enum_posts_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"modified" timestamp(3) with time zone,
  	"slug" varchar NOT NULL,
  	"author_id" integer,
  	"featured_image_id" integer,
  	"tier" "enum_posts_tier",
  	"cluster_id" integer,
  	"word_count" numeric,
  	"sitemap_priority" numeric DEFAULT 0.7,
  	"is_notified" boolean DEFAULT false,
  	"seo_open_graph_image_id" integer,
  	"seo_open_graph_site_name" varchar,
  	"seo_open_graph_url" varchar,
  	"seo_open_graph_type" varchar DEFAULT 'website',
  	"seo_open_graph_locale" varchar,
  	"seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"seo_open_graph_twitter_meta_card" "enum_posts_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"seo_open_graph_twitter_meta_image_id" integer,
  	"seo_canonical_override" varchar,
  	"seo_article_meta_published_time" timestamp(3) with time zone,
  	"seo_article_meta_modified_time" timestamp(3) with time zone,
  	"seo_updated_time" timestamp(3) with time zone,
  	"seo_json_ld_raw" varchar,
  	"kk_star_rating_avg" numeric DEFAULT 0,
  	"kk_star_rating_count" numeric DEFAULT 0,
  	"kk_star_rating_ratings" numeric DEFAULT 0,
  	"comment_count" numeric DEFAULT 0,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "posts_locales" (
  	"title" varchar NOT NULL,
  	"content_md" varchar,
  	"content" jsonb,
  	"excerpt" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_open_graph_title" varchar,
  	"seo_open_graph_description" varchar,
  	"seo_open_graph_image_alt" varchar,
  	"seo_open_graph_twitter_meta_title" varchar,
  	"seo_open_graph_twitter_meta_description" varchar,
  	"seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "posts_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"taxonomies_id" integer,
  	"faqs_id" integer
  );
  
  CREATE TABLE "_posts_v_version_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_version_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_posts_v_version_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__posts_v_version_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_type" "enum__posts_v_version_type" DEFAULT 'blog' NOT NULL,
  	"version_status" "enum__posts_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_modified" timestamp(3) with time zone,
  	"version_slug" varchar NOT NULL,
  	"version_author_id" integer,
  	"version_featured_image_id" integer,
  	"version_tier" "enum__posts_v_version_tier",
  	"version_cluster_id" integer,
  	"version_word_count" numeric,
  	"version_sitemap_priority" numeric DEFAULT 0.7,
  	"version_is_notified" boolean DEFAULT false,
  	"version_seo_open_graph_image_id" integer,
  	"version_seo_open_graph_site_name" varchar,
  	"version_seo_open_graph_url" varchar,
  	"version_seo_open_graph_type" varchar DEFAULT 'website',
  	"version_seo_open_graph_locale" varchar,
  	"version_seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"version_seo_open_graph_twitter_meta_card" "enum__posts_v_version_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"version_seo_open_graph_twitter_meta_image_id" integer,
  	"version_seo_canonical_override" varchar,
  	"version_seo_article_meta_published_time" timestamp(3) with time zone,
  	"version_seo_article_meta_modified_time" timestamp(3) with time zone,
  	"version_seo_updated_time" timestamp(3) with time zone,
  	"version_seo_json_ld_raw" varchar,
  	"version_kk_star_rating_avg" numeric DEFAULT 0,
  	"version_kk_star_rating_count" numeric DEFAULT 0,
  	"version_kk_star_rating_ratings" numeric DEFAULT 0,
  	"version_comment_count" numeric DEFAULT 0,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_posts_v_locales" (
  	"version_title" varchar NOT NULL,
  	"version_content_md" varchar,
  	"version_content" jsonb,
  	"version_excerpt" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_open_graph_title" varchar,
  	"version_seo_open_graph_description" varchar,
  	"version_seo_open_graph_image_alt" varchar,
  	"version_seo_open_graph_twitter_meta_title" varchar,
  	"version_seo_open_graph_twitter_meta_description" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_posts_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"taxonomies_id" integer,
  	"faqs_id" integer
  );
  
  CREATE TABLE "comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"post_id" integer,
  	"product_id" integer,
  	"author_name" varchar NOT NULL,
  	"author_email" varchar,
  	"content" varchar NOT NULL,
  	"status" "enum_comments_status" DEFAULT 'pending' NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "products_hero_slider" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL
  );
  
  CREATE TABLE "products_prices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"original_price" numeric NOT NULL,
  	"current_price" numeric NOT NULL,
  	"currency" "enum_products_prices_currency" DEFAULT 'VND',
  	"valid_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "products_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false
  );
  
  CREATE TABLE "products_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "products_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_products_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"status" "enum_products_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"slug" varchar NOT NULL,
  	"featured_image_id" integer,
  	"author_id" integer,
  	"sitemap_priority" numeric DEFAULT 0.8,
  	"hero_slide_video" varchar,
  	"kk_star_rating_avg" numeric,
  	"kk_star_rating_count" numeric,
  	"kk_star_rating_ratings" numeric,
  	"aggregate_rating_override" boolean DEFAULT false,
  	"comment_count" numeric DEFAULT 0,
  	"seo_open_graph_image_id" integer,
  	"seo_open_graph_site_name" varchar,
  	"seo_open_graph_url" varchar,
  	"seo_open_graph_type" varchar DEFAULT 'website',
  	"seo_open_graph_locale" varchar,
  	"seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"seo_open_graph_twitter_meta_card" "enum_products_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"seo_open_graph_twitter_meta_image_id" integer,
  	"seo_canonical_override" varchar,
  	"seo_article_meta_published_time" timestamp(3) with time zone,
  	"seo_article_meta_modified_time" timestamp(3) with time zone,
  	"seo_updated_time" timestamp(3) with time zone,
  	"seo_json_ld_raw" varchar,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "products_locales" (
  	"title" varchar NOT NULL,
  	"content_md" varchar,
  	"content" jsonb,
  	"excerpt" varchar,
  	"notice_md" varchar,
  	"notice" jsonb,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_open_graph_title" varchar,
  	"seo_open_graph_description" varchar,
  	"seo_open_graph_image_alt" varchar,
  	"seo_open_graph_twitter_meta_title" varchar,
  	"seo_open_graph_twitter_meta_description" varchar,
  	"seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "products_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"taxonomies_id" integer,
  	"faqs_id" integer
  );
  
  CREATE TABLE "_products_v_version_hero_slider" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_prices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_price" numeric NOT NULL,
  	"current_price" numeric NOT NULL,
  	"currency" "enum__products_v_version_prices_currency" DEFAULT 'VND',
  	"valid_until" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_products_v_version_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__products_v_version_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_products_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_status" "enum__products_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_slug" varchar NOT NULL,
  	"version_featured_image_id" integer,
  	"version_author_id" integer,
  	"version_sitemap_priority" numeric DEFAULT 0.8,
  	"version_hero_slide_video" varchar,
  	"version_kk_star_rating_avg" numeric,
  	"version_kk_star_rating_count" numeric,
  	"version_kk_star_rating_ratings" numeric,
  	"version_aggregate_rating_override" boolean DEFAULT false,
  	"version_comment_count" numeric DEFAULT 0,
  	"version_seo_open_graph_image_id" integer,
  	"version_seo_open_graph_site_name" varchar,
  	"version_seo_open_graph_url" varchar,
  	"version_seo_open_graph_type" varchar DEFAULT 'website',
  	"version_seo_open_graph_locale" varchar,
  	"version_seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"version_seo_open_graph_twitter_meta_card" "enum__products_v_version_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"version_seo_open_graph_twitter_meta_image_id" integer,
  	"version_seo_canonical_override" varchar,
  	"version_seo_article_meta_published_time" timestamp(3) with time zone,
  	"version_seo_article_meta_modified_time" timestamp(3) with time zone,
  	"version_seo_updated_time" timestamp(3) with time zone,
  	"version_seo_json_ld_raw" varchar,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_products_v_locales" (
  	"version_title" varchar NOT NULL,
  	"version_content_md" varchar,
  	"version_content" jsonb,
  	"version_excerpt" varchar,
  	"version_notice_md" varchar,
  	"version_notice" jsonb,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_open_graph_title" varchar,
  	"version_seo_open_graph_description" varchar,
  	"version_seo_open_graph_image_alt" varchar,
  	"version_seo_open_graph_twitter_meta_title" varchar,
  	"version_seo_open_graph_twitter_meta_description" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_products_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"taxonomies_id" integer,
  	"faqs_id" integer
  );
  
  CREATE TABLE "landings_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false
  );
  
  CREATE TABLE "landings_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_landings_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "landings_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"background_image_id" integer,
  	"cta_url" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_hero_locales" (
  	"title" varchar,
  	"subtitle" varchar,
  	"cta_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_content_locales" (
  	"body_md" varchar,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_image_gallery_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL
  );
  
  CREATE TABLE "landings_blocks_image_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar,
  	"avatar_id" integer,
  	"quote" varchar NOT NULL,
  	"rating" numeric
  );
  
  CREATE TABLE "landings_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"button_url" varchar,
  	"style" "enum_landings_blocks_cta_style" DEFAULT 'primary',
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_cta_locales" (
  	"title" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "landings_blocks_faq_items_locales" (
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_stats_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"icon" varchar
  );
  
  CREATE TABLE "landings_blocks_stats_items_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_pricing_table_columns_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"feature" varchar
  );
  
  CREATE TABLE "landings_blocks_pricing_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"price" varchar,
  	"cta_text" varchar,
  	"cta_url" varchar,
  	"highlighted" boolean DEFAULT false
  );
  
  CREATE TABLE "landings_blocks_pricing_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_pricing_table_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_blog_feed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category" varchar,
  	"limit" numeric DEFAULT 6,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_blog_feed_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_offer_cards_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"discount" varchar,
  	"image_id" integer,
  	"cta_url" varchar,
  	"expiry_date" timestamp(3) with time zone
  );
  
  CREATE TABLE "landings_blocks_offer_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_offer_cards_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_blocks_embed_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings_blocks_divider" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"style" "enum_landings_blocks_divider_style" DEFAULT 'solid',
  	"spacing" "enum_landings_blocks_divider_spacing" DEFAULT 'md',
  	"block_name" varchar
  );
  
  CREATE TABLE "landings_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "landings_faq_locales" (
  	"question" varchar,
  	"answer" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "landings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"slug" varchar NOT NULL,
  	"featured_image_id" integer,
  	"status" "enum_landings_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"is_disabled" boolean DEFAULT false,
  	"sitemap_priority" numeric DEFAULT 0.5,
  	"template" "enum_landings_template" DEFAULT 'default',
  	"seo_open_graph_image_id" integer,
  	"seo_open_graph_site_name" varchar,
  	"seo_open_graph_url" varchar,
  	"seo_open_graph_type" varchar DEFAULT 'website',
  	"seo_open_graph_locale" varchar,
  	"seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"seo_open_graph_twitter_meta_card" "enum_landings_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"seo_open_graph_twitter_meta_image_id" integer,
  	"seo_canonical_override" varchar,
  	"seo_article_meta_published_time" timestamp(3) with time zone,
  	"seo_article_meta_modified_time" timestamp(3) with time zone,
  	"seo_updated_time" timestamp(3) with time zone,
  	"seo_json_ld_raw" varchar,
  	"campaign_name" varchar,
  	"campaign_utm_source" varchar,
  	"campaign_utm_medium" varchar,
  	"campaign_utm_campaign" varchar,
  	"campaign_conversion_goal" varchar,
  	"campaign_ab_test_id" varchar,
  	"schema_type" "enum_landings_schema_type" DEFAULT 'WebPage',
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "landings_locales" (
  	"title" varchar NOT NULL,
  	"excerpt" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_open_graph_title" varchar,
  	"seo_open_graph_description" varchar,
  	"seo_open_graph_image_alt" varchar,
  	"seo_open_graph_twitter_meta_title" varchar,
  	"seo_open_graph_twitter_meta_description" varchar,
  	"seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "landings_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_landings_v_version_seo_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"is_hidden" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_version_seo_breadcrumbs_locales" (
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_version_seo_robots" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__landings_v_version_seo_robots",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"background_image_id" integer,
  	"cta_url" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_hero_locales" (
  	"title" varchar,
  	"subtitle" varchar,
  	"cta_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_content_locales" (
  	"body_md" varchar,
  	"body" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_image_gallery_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_image_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar,
  	"avatar_id" integer,
  	"quote" varchar NOT NULL,
  	"rating" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"button_url" varchar,
  	"style" "enum__landings_v_blocks_cta_style" DEFAULT 'primary',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_cta_locales" (
  	"title" varchar,
  	"description" varchar,
  	"button_text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_faq_items_locales" (
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_stats_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"icon" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_stats_items_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_pricing_table_columns_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"feature" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_pricing_table_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"price" varchar,
  	"cta_text" varchar,
  	"cta_url" varchar,
  	"highlighted" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_pricing_table" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_pricing_table_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_blog_feed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"category" varchar,
  	"limit" numeric DEFAULT 6,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_blog_feed_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_offer_cards_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"discount" varchar,
  	"image_id" integer,
  	"cta_url" varchar,
  	"expiry_date" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_offer_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_offer_cards_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_blocks_embed_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_blocks_divider" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"style" "enum__landings_v_blocks_divider_style" DEFAULT 'solid',
  	"spacing" "enum__landings_v_blocks_divider_spacing" DEFAULT 'md',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_landings_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landings_v_version_faq_locales" (
  	"question" varchar,
  	"answer" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_slug" varchar NOT NULL,
  	"version_featured_image_id" integer,
  	"version_status" "enum__landings_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_published_at" timestamp(3) with time zone,
  	"version_is_disabled" boolean DEFAULT false,
  	"version_sitemap_priority" numeric DEFAULT 0.5,
  	"version_template" "enum__landings_v_version_template" DEFAULT 'default',
  	"version_seo_open_graph_image_id" integer,
  	"version_seo_open_graph_site_name" varchar,
  	"version_seo_open_graph_url" varchar,
  	"version_seo_open_graph_type" varchar DEFAULT 'website',
  	"version_seo_open_graph_locale" varchar,
  	"version_seo_open_graph_twitter_meta_use_facebook_data" boolean DEFAULT true,
  	"version_seo_open_graph_twitter_meta_card" "enum__landings_v_version_seo_open_graph_twitter_meta_card" DEFAULT 'summary_large_image',
  	"version_seo_open_graph_twitter_meta_image_id" integer,
  	"version_seo_canonical_override" varchar,
  	"version_seo_article_meta_published_time" timestamp(3) with time zone,
  	"version_seo_article_meta_modified_time" timestamp(3) with time zone,
  	"version_seo_updated_time" timestamp(3) with time zone,
  	"version_seo_json_ld_raw" varchar,
  	"version_campaign_name" varchar,
  	"version_campaign_utm_source" varchar,
  	"version_campaign_utm_medium" varchar,
  	"version_campaign_utm_campaign" varchar,
  	"version_campaign_conversion_goal" varchar,
  	"version_campaign_ab_test_id" varchar,
  	"version_schema_type" "enum__landings_v_version_schema_type" DEFAULT 'WebPage',
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_landings_v_locales" (
  	"version_title" varchar NOT NULL,
  	"version_excerpt" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_open_graph_title" varchar,
  	"version_seo_open_graph_description" varchar,
  	"version_seo_open_graph_image_alt" varchar,
  	"version_seo_open_graph_twitter_meta_title" varchar,
  	"version_seo_open_graph_twitter_meta_description" varchar,
  	"version_seo_breadcrumb_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_landings_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "shortcodes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "shortcodes_locales" (
  	"title" varchar NOT NULL,
  	"content_md" varchar NOT NULL,
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_shortcodes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_name" varchar NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_shortcodes_v_locales" (
  	"version_title" varchar NOT NULL,
  	"version_content_md" varchar NOT NULL,
  	"version_content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"status_code" "enum_redirects_status_code" DEFAULT '301' NOT NULL,
  	"is_enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "rating_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"collection" varchar NOT NULL,
  	"content_id" varchar NOT NULL,
  	"ip_hash" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_folders_folder_type" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_payload_folders_folder_type",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload_folders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"folder_id" integer,
  	"tenant_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"sites_id" integer,
  	"taxonomies_id" integer,
  	"authors_id" integer,
  	"menus_id" integer,
  	"faqs_id" integer,
  	"pages_id" integer,
  	"posts_id" integer,
  	"comments_id" integer,
  	"products_id" integer,
  	"landings_id" integer,
  	"shortcodes_id" integer,
  	"redirects_id" integer,
  	"rating_events_id" integer,
  	"payload_folders_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_payload_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites_landing_slider" ADD CONSTRAINT "sites_landing_slider_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites_landing_slider" ADD CONSTRAINT "sites_landing_slider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_home_page_highlight" ADD CONSTRAINT "sites_home_page_highlight_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites_home_page_highlight" ADD CONSTRAINT "sites_home_page_highlight_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_home_page_highlight_locales" ADD CONSTRAINT "sites_home_page_highlight_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites_home_page_highlight"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_contact_right_side" ADD CONSTRAINT "sites_contact_right_side_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_contact_right_side_locales" ADD CONSTRAINT "sites_contact_right_side_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites_contact_right_side"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_contact_header_icons" ADD CONSTRAINT "sites_contact_header_icons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_contact_header_icons_locales" ADD CONSTRAINT "sites_contact_header_icons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites_contact_header_icons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_footer_address" ADD CONSTRAINT "sites_footer_address_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_footer_ecosystem_links" ADD CONSTRAINT "sites_footer_ecosystem_links_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites_footer_ecosystem_links" ADD CONSTRAINT "sites_footer_ecosystem_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_footer_ecosystem_links_locales" ADD CONSTRAINT "sites_footer_ecosystem_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites_footer_ecosystem_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_footer_partners" ADD CONSTRAINT "sites_footer_partners_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites_footer_partners" ADD CONSTRAINT "sites_footer_partners_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_page_group" ADD CONSTRAINT "sites_page_group_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_page_group_locales" ADD CONSTRAINT "sites_page_group_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites_page_group"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_opening_hours_day_of_week" ADD CONSTRAINT "sites_knowledge_graph_opening_hours_day_of_week_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites_knowledge_graph_opening_hours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_opening_hours" ADD CONSTRAINT "sites_knowledge_graph_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_founders" ADD CONSTRAINT "sites_knowledge_graph_founders_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_area_served" ADD CONSTRAINT "sites_knowledge_graph_area_served_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_knows_language" ADD CONSTRAINT "sites_knowledge_graph_knows_language_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_contact_point_available_language" ADD CONSTRAINT "sites_knowledge_graph_contact_point_available_language_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_knowledge_graph_additional_offices" ADD CONSTRAINT "sites_knowledge_graph_additional_offices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_social_profiles" ADD CONSTRAINT "sites_social_profiles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_branding_not_found_image_id_media_id_fk" FOREIGN KEY ("branding_not_found_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_sidebar_payment_qr_id_media_id_fk" FOREIGN KEY ("sidebar_payment_qr_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_seo_defaults_og_image_id_media_id_fk" FOREIGN KEY ("seo_defaults_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_knowledge_graph_logo_id_media_id_fk" FOREIGN KEY ("knowledge_graph_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sites_locales" ADD CONSTRAINT "sites_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_rels" ADD CONSTRAINT "sites_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_rels" ADD CONSTRAINT "sites_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_rels" ADD CONSTRAINT "sites_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "taxonomies_seo_breadcrumbs" ADD CONSTRAINT "taxonomies_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "taxonomies_seo_breadcrumbs_locales" ADD CONSTRAINT "taxonomies_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."taxonomies_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "taxonomies_seo_robots" ADD CONSTRAINT "taxonomies_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_parent_id_taxonomies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "taxonomies_locales" ADD CONSTRAINT "taxonomies_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "taxonomies_texts" ADD CONSTRAINT "taxonomies_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_taxonomies_v_version_seo_breadcrumbs" ADD CONSTRAINT "_taxonomies_v_version_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_taxonomies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_taxonomies_v_version_seo_breadcrumbs_locales" ADD CONSTRAINT "_taxonomies_v_version_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_taxonomies_v_version_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_taxonomies_v_version_seo_robots" ADD CONSTRAINT "_taxonomies_v_version_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_taxonomies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_taxonomies_v" ADD CONSTRAINT "_taxonomies_v_parent_id_taxonomies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_taxonomies_v" ADD CONSTRAINT "_taxonomies_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_taxonomies_v" ADD CONSTRAINT "_taxonomies_v_version_parent_id_taxonomies_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."taxonomies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_taxonomies_v" ADD CONSTRAINT "_taxonomies_v_version_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_taxonomies_v" ADD CONSTRAINT "_taxonomies_v_version_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_taxonomies_v_locales" ADD CONSTRAINT "_taxonomies_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_taxonomies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_taxonomies_v_texts" ADD CONSTRAINT "_taxonomies_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_taxonomies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "authors_same_as" ADD CONSTRAINT "authors_same_as_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors_locales" ADD CONSTRAINT "authors_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items_children" ADD CONSTRAINT "menus_items_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items_children_locales" ADD CONSTRAINT "menus_items_children_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus_items_children"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items" ADD CONSTRAINT "menus_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items_locales" ADD CONSTRAINT "menus_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus" ADD CONSTRAINT "menus_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "faqs_items" ADD CONSTRAINT "faqs_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "faqs_items_locales" ADD CONSTRAINT "faqs_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."faqs_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "faqs" ADD CONSTRAINT "faqs_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_faqs_v_version_items" ADD CONSTRAINT "_faqs_v_version_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_faqs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_faqs_v_version_items_locales" ADD CONSTRAINT "_faqs_v_version_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_faqs_v_version_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_faqs_v" ADD CONSTRAINT "_faqs_v_parent_id_faqs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."faqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_faqs_v" ADD CONSTRAINT "_faqs_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_seo_breadcrumbs" ADD CONSTRAINT "pages_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_seo_breadcrumbs_locales" ADD CONSTRAINT "pages_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_seo_robots" ADD CONSTRAINT "pages_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_texts" ADD CONSTRAINT "pages_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_seo_breadcrumbs" ADD CONSTRAINT "_pages_v_version_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_seo_breadcrumbs_locales" ADD CONSTRAINT "_pages_v_version_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_version_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_seo_robots" ADD CONSTRAINT "_pages_v_version_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_texts" ADD CONSTRAINT "_pages_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_seo_breadcrumbs" ADD CONSTRAINT "posts_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_seo_breadcrumbs_locales" ADD CONSTRAINT "posts_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_seo_robots" ADD CONSTRAINT "posts_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_cluster_id_taxonomies_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."taxonomies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_locales" ADD CONSTRAINT "posts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_texts" ADD CONSTRAINT "posts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_taxonomies_fk" FOREIGN KEY ("taxonomies_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_seo_breadcrumbs" ADD CONSTRAINT "_posts_v_version_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_seo_breadcrumbs_locales" ADD CONSTRAINT "_posts_v_version_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_version_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_seo_robots" ADD CONSTRAINT "_posts_v_version_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_cluster_id_taxonomies_id_fk" FOREIGN KEY ("version_cluster_id") REFERENCES "public"."taxonomies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_locales" ADD CONSTRAINT "_posts_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_texts" ADD CONSTRAINT "_posts_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_taxonomies_fk" FOREIGN KEY ("taxonomies_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_hero_slider" ADD CONSTRAINT "products_hero_slider_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_hero_slider" ADD CONSTRAINT "products_hero_slider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_prices" ADD CONSTRAINT "products_prices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_seo_breadcrumbs" ADD CONSTRAINT "products_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_seo_breadcrumbs_locales" ADD CONSTRAINT "products_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_seo_robots" ADD CONSTRAINT "products_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_locales" ADD CONSTRAINT "products_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_texts" ADD CONSTRAINT "products_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_taxonomies_fk" FOREIGN KEY ("taxonomies_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_hero_slider" ADD CONSTRAINT "_products_v_version_hero_slider_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_version_hero_slider" ADD CONSTRAINT "_products_v_version_hero_slider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_prices" ADD CONSTRAINT "_products_v_version_prices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_seo_breadcrumbs" ADD CONSTRAINT "_products_v_version_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_seo_breadcrumbs_locales" ADD CONSTRAINT "_products_v_version_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v_version_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_seo_robots" ADD CONSTRAINT "_products_v_version_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_locales" ADD CONSTRAINT "_products_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_texts" ADD CONSTRAINT "_products_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_taxonomies_fk" FOREIGN KEY ("taxonomies_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_seo_breadcrumbs" ADD CONSTRAINT "landings_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_seo_breadcrumbs_locales" ADD CONSTRAINT "landings_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_seo_robots" ADD CONSTRAINT "landings_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_hero" ADD CONSTRAINT "landings_blocks_hero_background_image_id_media_id_fk" FOREIGN KEY ("background_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings_blocks_hero" ADD CONSTRAINT "landings_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_hero_locales" ADD CONSTRAINT "landings_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_content" ADD CONSTRAINT "landings_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_content_locales" ADD CONSTRAINT "landings_blocks_content_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_image_gallery_images" ADD CONSTRAINT "landings_blocks_image_gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings_blocks_image_gallery_images" ADD CONSTRAINT "landings_blocks_image_gallery_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_image_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_image_gallery" ADD CONSTRAINT "landings_blocks_image_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_testimonials_items" ADD CONSTRAINT "landings_blocks_testimonials_items_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings_blocks_testimonials_items" ADD CONSTRAINT "landings_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_testimonials" ADD CONSTRAINT "landings_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_cta" ADD CONSTRAINT "landings_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_cta_locales" ADD CONSTRAINT "landings_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_faq_items" ADD CONSTRAINT "landings_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_faq_items_locales" ADD CONSTRAINT "landings_blocks_faq_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_faq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_faq" ADD CONSTRAINT "landings_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_stats_items" ADD CONSTRAINT "landings_blocks_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_stats_items_locales" ADD CONSTRAINT "landings_blocks_stats_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_stats_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_stats" ADD CONSTRAINT "landings_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_pricing_table_columns_features" ADD CONSTRAINT "landings_blocks_pricing_table_columns_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_pricing_table_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_pricing_table_columns" ADD CONSTRAINT "landings_blocks_pricing_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_pricing_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_pricing_table" ADD CONSTRAINT "landings_blocks_pricing_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_pricing_table_locales" ADD CONSTRAINT "landings_blocks_pricing_table_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_pricing_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_blog_feed" ADD CONSTRAINT "landings_blocks_blog_feed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_blog_feed_locales" ADD CONSTRAINT "landings_blocks_blog_feed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_blog_feed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_offer_cards_cards" ADD CONSTRAINT "landings_blocks_offer_cards_cards_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings_blocks_offer_cards_cards" ADD CONSTRAINT "landings_blocks_offer_cards_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_offer_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_offer_cards" ADD CONSTRAINT "landings_blocks_offer_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_offer_cards_locales" ADD CONSTRAINT "landings_blocks_offer_cards_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_offer_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_embed" ADD CONSTRAINT "landings_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_embed_locales" ADD CONSTRAINT "landings_blocks_embed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_blocks_embed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_blocks_divider" ADD CONSTRAINT "landings_blocks_divider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_faq" ADD CONSTRAINT "landings_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_faq_locales" ADD CONSTRAINT "landings_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings" ADD CONSTRAINT "landings_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings" ADD CONSTRAINT "landings_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings" ADD CONSTRAINT "landings_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings" ADD CONSTRAINT "landings_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings" ADD CONSTRAINT "landings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landings_locales" ADD CONSTRAINT "landings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landings_texts" ADD CONSTRAINT "landings_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_version_seo_breadcrumbs" ADD CONSTRAINT "_landings_v_version_seo_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_version_seo_breadcrumbs_locales" ADD CONSTRAINT "_landings_v_version_seo_breadcrumbs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_version_seo_breadcrumbs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_version_seo_robots" ADD CONSTRAINT "_landings_v_version_seo_robots_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_hero" ADD CONSTRAINT "_landings_v_blocks_hero_background_image_id_media_id_fk" FOREIGN KEY ("background_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_hero" ADD CONSTRAINT "_landings_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_hero_locales" ADD CONSTRAINT "_landings_v_blocks_hero_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_hero"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_content" ADD CONSTRAINT "_landings_v_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_content_locales" ADD CONSTRAINT "_landings_v_blocks_content_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_image_gallery_images" ADD CONSTRAINT "_landings_v_blocks_image_gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_image_gallery_images" ADD CONSTRAINT "_landings_v_blocks_image_gallery_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_image_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_image_gallery" ADD CONSTRAINT "_landings_v_blocks_image_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_testimonials_items" ADD CONSTRAINT "_landings_v_blocks_testimonials_items_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_testimonials_items" ADD CONSTRAINT "_landings_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_testimonials" ADD CONSTRAINT "_landings_v_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_cta" ADD CONSTRAINT "_landings_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_cta_locales" ADD CONSTRAINT "_landings_v_blocks_cta_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_faq_items" ADD CONSTRAINT "_landings_v_blocks_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_faq_items_locales" ADD CONSTRAINT "_landings_v_blocks_faq_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_faq_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_faq" ADD CONSTRAINT "_landings_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_stats_items" ADD CONSTRAINT "_landings_v_blocks_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_stats_items_locales" ADD CONSTRAINT "_landings_v_blocks_stats_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_stats_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_stats" ADD CONSTRAINT "_landings_v_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_pricing_table_columns_features" ADD CONSTRAINT "_landings_v_blocks_pricing_table_columns_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_pricing_table_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_pricing_table_columns" ADD CONSTRAINT "_landings_v_blocks_pricing_table_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_pricing_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_pricing_table" ADD CONSTRAINT "_landings_v_blocks_pricing_table_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_pricing_table_locales" ADD CONSTRAINT "_landings_v_blocks_pricing_table_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_pricing_table"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_blog_feed" ADD CONSTRAINT "_landings_v_blocks_blog_feed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_blog_feed_locales" ADD CONSTRAINT "_landings_v_blocks_blog_feed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_blog_feed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_offer_cards_cards" ADD CONSTRAINT "_landings_v_blocks_offer_cards_cards_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_offer_cards_cards" ADD CONSTRAINT "_landings_v_blocks_offer_cards_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_offer_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_offer_cards" ADD CONSTRAINT "_landings_v_blocks_offer_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_offer_cards_locales" ADD CONSTRAINT "_landings_v_blocks_offer_cards_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_offer_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_embed" ADD CONSTRAINT "_landings_v_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_embed_locales" ADD CONSTRAINT "_landings_v_blocks_embed_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_blocks_embed"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_blocks_divider" ADD CONSTRAINT "_landings_v_blocks_divider_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_version_faq" ADD CONSTRAINT "_landings_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_version_faq_locales" ADD CONSTRAINT "_landings_v_version_faq_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v_version_faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v" ADD CONSTRAINT "_landings_v_parent_id_landings_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."landings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v" ADD CONSTRAINT "_landings_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v" ADD CONSTRAINT "_landings_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v" ADD CONSTRAINT "_landings_v_version_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v" ADD CONSTRAINT "_landings_v_version_seo_open_graph_twitter_meta_image_id_media_id_fk" FOREIGN KEY ("version_seo_open_graph_twitter_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v" ADD CONSTRAINT "_landings_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landings_v_locales" ADD CONSTRAINT "_landings_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landings_v_texts" ADD CONSTRAINT "_landings_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_landings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shortcodes" ADD CONSTRAINT "shortcodes_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shortcodes_locales" ADD CONSTRAINT "shortcodes_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shortcodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_shortcodes_v" ADD CONSTRAINT "_shortcodes_v_parent_id_shortcodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shortcodes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shortcodes_v" ADD CONSTRAINT "_shortcodes_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_shortcodes_v_locales" ADD CONSTRAINT "_shortcodes_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_shortcodes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects" ADD CONSTRAINT "redirects_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_folders_folder_type" ADD CONSTRAINT "payload_folders_folder_type_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_folders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_folders" ADD CONSTRAINT "payload_folders_folder_id_payload_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."payload_folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_folders" ADD CONSTRAINT "payload_folders_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_taxonomies_fk" FOREIGN KEY ("taxonomies_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menus_fk" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_landings_fk" FOREIGN KEY ("landings_id") REFERENCES "public"."landings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shortcodes_fk" FOREIGN KEY ("shortcodes_id") REFERENCES "public"."shortcodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rating_events_fk" FOREIGN KEY ("rating_events_id") REFERENCES "public"."rating_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_folders_fk" FOREIGN KEY ("payload_folders_id") REFERENCES "public"."payload_folders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_tenants_order_idx" ON "users_tenants" USING btree ("_order");
  CREATE INDEX "users_tenants_parent_id_idx" ON "users_tenants" USING btree ("_parent_id");
  CREATE INDEX "users_tenants_tenant_idx" ON "users_tenants" USING btree ("tenant_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_tenant_idx" ON "media" USING btree ("tenant_id");
  CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "sites_landing_slider_order_idx" ON "sites_landing_slider" USING btree ("_order");
  CREATE INDEX "sites_landing_slider_parent_id_idx" ON "sites_landing_slider" USING btree ("_parent_id");
  CREATE INDEX "sites_landing_slider_image_idx" ON "sites_landing_slider" USING btree ("image_id");
  CREATE INDEX "sites_home_page_highlight_order_idx" ON "sites_home_page_highlight" USING btree ("_order");
  CREATE INDEX "sites_home_page_highlight_parent_id_idx" ON "sites_home_page_highlight" USING btree ("_parent_id");
  CREATE INDEX "sites_home_page_highlight_image_idx" ON "sites_home_page_highlight" USING btree ("image_id");
  CREATE UNIQUE INDEX "sites_home_page_highlight_locales_locale_parent_id_unique" ON "sites_home_page_highlight_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sites_contact_right_side_order_idx" ON "sites_contact_right_side" USING btree ("_order");
  CREATE INDEX "sites_contact_right_side_parent_id_idx" ON "sites_contact_right_side" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "sites_contact_right_side_locales_locale_parent_id_unique" ON "sites_contact_right_side_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sites_contact_header_icons_order_idx" ON "sites_contact_header_icons" USING btree ("_order");
  CREATE INDEX "sites_contact_header_icons_parent_id_idx" ON "sites_contact_header_icons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "sites_contact_header_icons_locales_locale_parent_id_unique" ON "sites_contact_header_icons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sites_footer_address_order_idx" ON "sites_footer_address" USING btree ("_order");
  CREATE INDEX "sites_footer_address_parent_id_idx" ON "sites_footer_address" USING btree ("_parent_id");
  CREATE INDEX "sites_footer_address_locale_idx" ON "sites_footer_address" USING btree ("_locale");
  CREATE INDEX "sites_footer_ecosystem_links_order_idx" ON "sites_footer_ecosystem_links" USING btree ("_order");
  CREATE INDEX "sites_footer_ecosystem_links_parent_id_idx" ON "sites_footer_ecosystem_links" USING btree ("_parent_id");
  CREATE INDEX "sites_footer_ecosystem_links_logo_idx" ON "sites_footer_ecosystem_links" USING btree ("logo_id");
  CREATE UNIQUE INDEX "sites_footer_ecosystem_links_locales_locale_parent_id_unique" ON "sites_footer_ecosystem_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sites_footer_partners_order_idx" ON "sites_footer_partners" USING btree ("_order");
  CREATE INDEX "sites_footer_partners_parent_id_idx" ON "sites_footer_partners" USING btree ("_parent_id");
  CREATE INDEX "sites_footer_partners_logo_idx" ON "sites_footer_partners" USING btree ("logo_id");
  CREATE INDEX "sites_page_group_order_idx" ON "sites_page_group" USING btree ("_order");
  CREATE INDEX "sites_page_group_parent_id_idx" ON "sites_page_group" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "sites_page_group_locales_locale_parent_id_unique" ON "sites_page_group_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sites_knowledge_graph_opening_hours_day_of_week_order_idx" ON "sites_knowledge_graph_opening_hours_day_of_week" USING btree ("order");
  CREATE INDEX "sites_knowledge_graph_opening_hours_day_of_week_parent_idx" ON "sites_knowledge_graph_opening_hours_day_of_week" USING btree ("parent_id");
  CREATE INDEX "sites_knowledge_graph_opening_hours_order_idx" ON "sites_knowledge_graph_opening_hours" USING btree ("_order");
  CREATE INDEX "sites_knowledge_graph_opening_hours_parent_id_idx" ON "sites_knowledge_graph_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "sites_knowledge_graph_founders_order_idx" ON "sites_knowledge_graph_founders" USING btree ("_order");
  CREATE INDEX "sites_knowledge_graph_founders_parent_id_idx" ON "sites_knowledge_graph_founders" USING btree ("_parent_id");
  CREATE INDEX "sites_knowledge_graph_area_served_order_idx" ON "sites_knowledge_graph_area_served" USING btree ("_order");
  CREATE INDEX "sites_knowledge_graph_area_served_parent_id_idx" ON "sites_knowledge_graph_area_served" USING btree ("_parent_id");
  CREATE INDEX "sites_knowledge_graph_knows_language_order_idx" ON "sites_knowledge_graph_knows_language" USING btree ("order");
  CREATE INDEX "sites_knowledge_graph_knows_language_parent_idx" ON "sites_knowledge_graph_knows_language" USING btree ("parent_id");
  CREATE INDEX "sites_knowledge_graph_contact_point_available_language_order_idx" ON "sites_knowledge_graph_contact_point_available_language" USING btree ("order");
  CREATE INDEX "sites_knowledge_graph_contact_point_available_language_parent_idx" ON "sites_knowledge_graph_contact_point_available_language" USING btree ("parent_id");
  CREATE INDEX "sites_knowledge_graph_additional_offices_order_idx" ON "sites_knowledge_graph_additional_offices" USING btree ("_order");
  CREATE INDEX "sites_knowledge_graph_additional_offices_parent_id_idx" ON "sites_knowledge_graph_additional_offices" USING btree ("_parent_id");
  CREATE INDEX "sites_social_profiles_order_idx" ON "sites_social_profiles" USING btree ("_order");
  CREATE INDEX "sites_social_profiles_parent_id_idx" ON "sites_social_profiles" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "sites_site_key_idx" ON "sites" USING btree ("site_key");
  CREATE INDEX "sites_branding_branding_logo_idx" ON "sites" USING btree ("branding_logo_id");
  CREATE INDEX "sites_branding_branding_favicon_idx" ON "sites" USING btree ("branding_favicon_id");
  CREATE INDEX "sites_branding_branding_not_found_image_idx" ON "sites" USING btree ("branding_not_found_image_id");
  CREATE INDEX "sites_sidebar_sidebar_payment_qr_idx" ON "sites" USING btree ("sidebar_payment_qr_id");
  CREATE INDEX "sites_seo_defaults_seo_defaults_og_image_idx" ON "sites" USING btree ("seo_defaults_og_image_id");
  CREATE INDEX "sites_knowledge_graph_knowledge_graph_logo_idx" ON "sites" USING btree ("knowledge_graph_logo_id");
  CREATE INDEX "sites_updated_at_idx" ON "sites" USING btree ("updated_at");
  CREATE INDEX "sites_created_at_idx" ON "sites" USING btree ("created_at");
  CREATE UNIQUE INDEX "sites_locales_locale_parent_id_unique" ON "sites_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sites_rels_order_idx" ON "sites_rels" USING btree ("order");
  CREATE INDEX "sites_rels_parent_idx" ON "sites_rels" USING btree ("parent_id");
  CREATE INDEX "sites_rels_path_idx" ON "sites_rels" USING btree ("path");
  CREATE INDEX "sites_rels_posts_id_idx" ON "sites_rels" USING btree ("posts_id");
  CREATE INDEX "sites_rels_products_id_idx" ON "sites_rels" USING btree ("products_id");
  CREATE INDEX "taxonomies_seo_breadcrumbs_order_idx" ON "taxonomies_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "taxonomies_seo_breadcrumbs_parent_id_idx" ON "taxonomies_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "taxonomies_seo_breadcrumbs_locales_locale_parent_id_unique" ON "taxonomies_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "taxonomies_seo_robots_order_idx" ON "taxonomies_seo_robots" USING btree ("order");
  CREATE INDEX "taxonomies_seo_robots_parent_idx" ON "taxonomies_seo_robots" USING btree ("parent_id");
  CREATE INDEX "taxonomies_tenant_idx" ON "taxonomies" USING btree ("tenant_id");
  CREATE INDEX "taxonomies_parent_idx" ON "taxonomies" USING btree ("parent_id");
  CREATE INDEX "taxonomies_seo_open_graph_seo_open_graph_image_idx" ON "taxonomies" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "taxonomies_seo_open_graph_twitter_meta_seo_open_graph_tw_idx" ON "taxonomies" USING btree ("seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "taxonomies_updated_at_idx" ON "taxonomies" USING btree ("updated_at");
  CREATE INDEX "taxonomies_created_at_idx" ON "taxonomies" USING btree ("created_at");
  CREATE UNIQUE INDEX "taxonomies_locales_locale_parent_id_unique" ON "taxonomies_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "taxonomies_texts_order_parent" ON "taxonomies_texts" USING btree ("order","parent_id");
  CREATE INDEX "_taxonomies_v_version_seo_breadcrumbs_order_idx" ON "_taxonomies_v_version_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_taxonomies_v_version_seo_breadcrumbs_parent_id_idx" ON "_taxonomies_v_version_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_taxonomies_v_version_seo_breadcrumbs_locales_locale_parent_" ON "_taxonomies_v_version_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_taxonomies_v_version_seo_robots_order_idx" ON "_taxonomies_v_version_seo_robots" USING btree ("order");
  CREATE INDEX "_taxonomies_v_version_seo_robots_parent_idx" ON "_taxonomies_v_version_seo_robots" USING btree ("parent_id");
  CREATE INDEX "_taxonomies_v_parent_idx" ON "_taxonomies_v" USING btree ("parent_id");
  CREATE INDEX "_taxonomies_v_version_version_tenant_idx" ON "_taxonomies_v" USING btree ("version_tenant_id");
  CREATE INDEX "_taxonomies_v_version_version_parent_idx" ON "_taxonomies_v" USING btree ("version_parent_id");
  CREATE INDEX "_taxonomies_v_version_seo_open_graph_version_seo_open_gr_idx" ON "_taxonomies_v" USING btree ("version_seo_open_graph_image_id");
  CREATE INDEX "_taxonomies_v_version_seo_open_graph_twitter_meta_versio_idx" ON "_taxonomies_v" USING btree ("version_seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "_taxonomies_v_version_version_updated_at_idx" ON "_taxonomies_v" USING btree ("version_updated_at");
  CREATE INDEX "_taxonomies_v_version_version_created_at_idx" ON "_taxonomies_v" USING btree ("version_created_at");
  CREATE INDEX "_taxonomies_v_created_at_idx" ON "_taxonomies_v" USING btree ("created_at");
  CREATE INDEX "_taxonomies_v_updated_at_idx" ON "_taxonomies_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_taxonomies_v_locales_locale_parent_id_unique" ON "_taxonomies_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_taxonomies_v_texts_order_parent" ON "_taxonomies_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "authors_same_as_order_idx" ON "authors_same_as" USING btree ("_order");
  CREATE INDEX "authors_same_as_parent_id_idx" ON "authors_same_as" USING btree ("_parent_id");
  CREATE INDEX "authors_tenant_idx" ON "authors" USING btree ("tenant_id");
  CREATE INDEX "authors_avatar_idx" ON "authors" USING btree ("avatar_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_locales_locale_parent_id_unique" ON "authors_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "menus_items_children_order_idx" ON "menus_items_children" USING btree ("_order");
  CREATE INDEX "menus_items_children_parent_id_idx" ON "menus_items_children" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "menus_items_children_locales_locale_parent_id_unique" ON "menus_items_children_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "menus_items_order_idx" ON "menus_items" USING btree ("_order");
  CREATE INDEX "menus_items_parent_id_idx" ON "menus_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "menus_items_locales_locale_parent_id_unique" ON "menus_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "menus_tenant_idx" ON "menus" USING btree ("tenant_id");
  CREATE INDEX "menus_updated_at_idx" ON "menus" USING btree ("updated_at");
  CREATE INDEX "menus_created_at_idx" ON "menus" USING btree ("created_at");
  CREATE INDEX "faqs_items_order_idx" ON "faqs_items" USING btree ("_order");
  CREATE INDEX "faqs_items_parent_id_idx" ON "faqs_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "faqs_items_locales_locale_parent_id_unique" ON "faqs_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "faqs_tenant_idx" ON "faqs" USING btree ("tenant_id");
  CREATE INDEX "faqs_updated_at_idx" ON "faqs" USING btree ("updated_at");
  CREATE INDEX "faqs_created_at_idx" ON "faqs" USING btree ("created_at");
  CREATE INDEX "faqs_deleted_at_idx" ON "faqs" USING btree ("deleted_at");
  CREATE INDEX "_faqs_v_version_items_order_idx" ON "_faqs_v_version_items" USING btree ("_order");
  CREATE INDEX "_faqs_v_version_items_parent_id_idx" ON "_faqs_v_version_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_faqs_v_version_items_locales_locale_parent_id_unique" ON "_faqs_v_version_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_faqs_v_parent_idx" ON "_faqs_v" USING btree ("parent_id");
  CREATE INDEX "_faqs_v_version_version_tenant_idx" ON "_faqs_v" USING btree ("version_tenant_id");
  CREATE INDEX "_faqs_v_version_version_updated_at_idx" ON "_faqs_v" USING btree ("version_updated_at");
  CREATE INDEX "_faqs_v_version_version_created_at_idx" ON "_faqs_v" USING btree ("version_created_at");
  CREATE INDEX "_faqs_v_version_version_deleted_at_idx" ON "_faqs_v" USING btree ("version_deleted_at");
  CREATE INDEX "_faqs_v_created_at_idx" ON "_faqs_v" USING btree ("created_at");
  CREATE INDEX "_faqs_v_updated_at_idx" ON "_faqs_v" USING btree ("updated_at");
  CREATE INDEX "pages_seo_breadcrumbs_order_idx" ON "pages_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "pages_seo_breadcrumbs_parent_id_idx" ON "pages_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_seo_breadcrumbs_locales_locale_parent_id_unique" ON "pages_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_seo_robots_order_idx" ON "pages_seo_robots" USING btree ("order");
  CREATE INDEX "pages_seo_robots_parent_idx" ON "pages_seo_robots" USING btree ("parent_id");
  CREATE INDEX "pages_tenant_idx" ON "pages" USING btree ("tenant_id");
  CREATE INDEX "pages_featured_image_idx" ON "pages" USING btree ("featured_image_id");
  CREATE INDEX "pages_seo_open_graph_seo_open_graph_image_idx" ON "pages" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "pages_seo_open_graph_twitter_meta_seo_open_graph_twitter_idx" ON "pages" USING btree ("seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "pages_created_by_idx" ON "pages" USING btree ("created_by_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages_deleted_at_idx" ON "pages" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_texts_order_parent" ON "pages_texts" USING btree ("order","parent_id");
  CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_faqs_id_idx" ON "pages_rels" USING btree ("faqs_id");
  CREATE INDEX "_pages_v_version_seo_breadcrumbs_order_idx" ON "_pages_v_version_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_pages_v_version_seo_breadcrumbs_parent_id_idx" ON "_pages_v_version_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_version_seo_breadcrumbs_locales_locale_parent_id_un" ON "_pages_v_version_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_version_seo_robots_order_idx" ON "_pages_v_version_seo_robots" USING btree ("order");
  CREATE INDEX "_pages_v_version_seo_robots_parent_idx" ON "_pages_v_version_seo_robots" USING btree ("parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_tenant_idx" ON "_pages_v" USING btree ("version_tenant_id");
  CREATE INDEX "_pages_v_version_version_featured_image_idx" ON "_pages_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_pages_v_version_seo_open_graph_version_seo_open_graph_i_idx" ON "_pages_v" USING btree ("version_seo_open_graph_image_id");
  CREATE INDEX "_pages_v_version_seo_open_graph_twitter_meta_version_seo_idx" ON "_pages_v" USING btree ("version_seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "_pages_v_version_version_created_by_idx" ON "_pages_v" USING btree ("version_created_by_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_texts_order_parent" ON "_pages_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_pages_v_rels_order_idx" ON "_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_faqs_id_idx" ON "_pages_v_rels" USING btree ("faqs_id");
  CREATE INDEX "posts_seo_breadcrumbs_order_idx" ON "posts_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "posts_seo_breadcrumbs_parent_id_idx" ON "posts_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "posts_seo_breadcrumbs_locales_locale_parent_id_unique" ON "posts_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "posts_seo_robots_order_idx" ON "posts_seo_robots" USING btree ("order");
  CREATE INDEX "posts_seo_robots_parent_idx" ON "posts_seo_robots" USING btree ("parent_id");
  CREATE INDEX "posts_tenant_idx" ON "posts" USING btree ("tenant_id");
  CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id");
  CREATE INDEX "posts_featured_image_idx" ON "posts" USING btree ("featured_image_id");
  CREATE INDEX "posts_cluster_idx" ON "posts" USING btree ("cluster_id");
  CREATE INDEX "posts_seo_open_graph_seo_open_graph_image_idx" ON "posts" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "posts_seo_open_graph_twitter_meta_seo_open_graph_twitter_idx" ON "posts" USING btree ("seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "posts_created_by_idx" ON "posts" USING btree ("created_by_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts_deleted_at_idx" ON "posts" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "posts_locales_locale_parent_id_unique" ON "posts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "posts_texts_order_parent" ON "posts_texts" USING btree ("order","parent_id");
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_taxonomies_id_idx" ON "posts_rels" USING btree ("taxonomies_id");
  CREATE INDEX "posts_rels_faqs_id_idx" ON "posts_rels" USING btree ("faqs_id");
  CREATE INDEX "_posts_v_version_seo_breadcrumbs_order_idx" ON "_posts_v_version_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_posts_v_version_seo_breadcrumbs_parent_id_idx" ON "_posts_v_version_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_posts_v_version_seo_breadcrumbs_locales_locale_parent_id_un" ON "_posts_v_version_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_posts_v_version_seo_robots_order_idx" ON "_posts_v_version_seo_robots" USING btree ("order");
  CREATE INDEX "_posts_v_version_seo_robots_parent_idx" ON "_posts_v_version_seo_robots" USING btree ("parent_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_tenant_idx" ON "_posts_v" USING btree ("version_tenant_id");
  CREATE INDEX "_posts_v_version_version_author_idx" ON "_posts_v" USING btree ("version_author_id");
  CREATE INDEX "_posts_v_version_version_featured_image_idx" ON "_posts_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_posts_v_version_version_cluster_idx" ON "_posts_v" USING btree ("version_cluster_id");
  CREATE INDEX "_posts_v_version_seo_open_graph_version_seo_open_graph_i_idx" ON "_posts_v" USING btree ("version_seo_open_graph_image_id");
  CREATE INDEX "_posts_v_version_seo_open_graph_twitter_meta_version_seo_idx" ON "_posts_v" USING btree ("version_seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "_posts_v_version_version_created_by_idx" ON "_posts_v" USING btree ("version_created_by_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version_deleted_at_idx" ON "_posts_v" USING btree ("version_deleted_at");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_posts_v_locales_locale_parent_id_unique" ON "_posts_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_posts_v_texts_order_parent" ON "_posts_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_taxonomies_id_idx" ON "_posts_v_rels" USING btree ("taxonomies_id");
  CREATE INDEX "_posts_v_rels_faqs_id_idx" ON "_posts_v_rels" USING btree ("faqs_id");
  CREATE INDEX "comments_tenant_idx" ON "comments" USING btree ("tenant_id");
  CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id");
  CREATE INDEX "comments_product_idx" ON "comments" USING btree ("product_id");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "products_hero_slider_order_idx" ON "products_hero_slider" USING btree ("_order");
  CREATE INDEX "products_hero_slider_parent_id_idx" ON "products_hero_slider" USING btree ("_parent_id");
  CREATE INDEX "products_hero_slider_image_idx" ON "products_hero_slider" USING btree ("image_id");
  CREATE INDEX "products_prices_order_idx" ON "products_prices" USING btree ("_order");
  CREATE INDEX "products_prices_parent_id_idx" ON "products_prices" USING btree ("_parent_id");
  CREATE INDEX "products_seo_breadcrumbs_order_idx" ON "products_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "products_seo_breadcrumbs_parent_id_idx" ON "products_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_seo_breadcrumbs_locales_locale_parent_id_unique" ON "products_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_seo_robots_order_idx" ON "products_seo_robots" USING btree ("order");
  CREATE INDEX "products_seo_robots_parent_idx" ON "products_seo_robots" USING btree ("parent_id");
  CREATE INDEX "products_tenant_idx" ON "products" USING btree ("tenant_id");
  CREATE INDEX "products_featured_image_idx" ON "products" USING btree ("featured_image_id");
  CREATE INDEX "products_author_idx" ON "products" USING btree ("author_id");
  CREATE INDEX "products_seo_open_graph_seo_open_graph_image_idx" ON "products" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "products_seo_open_graph_twitter_meta_seo_open_graph_twit_idx" ON "products" USING btree ("seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "products_created_by_idx" ON "products" USING btree ("created_by_id");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products_deleted_at_idx" ON "products" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "products_locales_locale_parent_id_unique" ON "products_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_texts_order_parent" ON "products_texts" USING btree ("order","parent_id");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_taxonomies_id_idx" ON "products_rels" USING btree ("taxonomies_id");
  CREATE INDEX "products_rels_faqs_id_idx" ON "products_rels" USING btree ("faqs_id");
  CREATE INDEX "_products_v_version_hero_slider_order_idx" ON "_products_v_version_hero_slider" USING btree ("_order");
  CREATE INDEX "_products_v_version_hero_slider_parent_id_idx" ON "_products_v_version_hero_slider" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_hero_slider_image_idx" ON "_products_v_version_hero_slider" USING btree ("image_id");
  CREATE INDEX "_products_v_version_prices_order_idx" ON "_products_v_version_prices" USING btree ("_order");
  CREATE INDEX "_products_v_version_prices_parent_id_idx" ON "_products_v_version_prices" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_seo_breadcrumbs_order_idx" ON "_products_v_version_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_products_v_version_seo_breadcrumbs_parent_id_idx" ON "_products_v_version_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_products_v_version_seo_breadcrumbs_locales_locale_parent_id" ON "_products_v_version_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_version_seo_robots_order_idx" ON "_products_v_version_seo_robots" USING btree ("order");
  CREATE INDEX "_products_v_version_seo_robots_parent_idx" ON "_products_v_version_seo_robots" USING btree ("parent_id");
  CREATE INDEX "_products_v_parent_idx" ON "_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_tenant_idx" ON "_products_v" USING btree ("version_tenant_id");
  CREATE INDEX "_products_v_version_version_featured_image_idx" ON "_products_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_products_v_version_version_author_idx" ON "_products_v" USING btree ("version_author_id");
  CREATE INDEX "_products_v_version_seo_open_graph_version_seo_open_grap_idx" ON "_products_v" USING btree ("version_seo_open_graph_image_id");
  CREATE INDEX "_products_v_version_seo_open_graph_twitter_meta_version__idx" ON "_products_v" USING btree ("version_seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "_products_v_version_version_created_by_idx" ON "_products_v" USING btree ("version_created_by_id");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version_deleted_at_idx" ON "_products_v" USING btree ("version_deleted_at");
  CREATE INDEX "_products_v_created_at_idx" ON "_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "_products_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_products_v_locales_locale_parent_id_unique" ON "_products_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_texts_order_parent" ON "_products_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_products_v_rels_order_idx" ON "_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_taxonomies_id_idx" ON "_products_v_rels" USING btree ("taxonomies_id");
  CREATE INDEX "_products_v_rels_faqs_id_idx" ON "_products_v_rels" USING btree ("faqs_id");
  CREATE INDEX "landings_seo_breadcrumbs_order_idx" ON "landings_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "landings_seo_breadcrumbs_parent_id_idx" ON "landings_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "landings_seo_breadcrumbs_locales_locale_parent_id_unique" ON "landings_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_seo_robots_order_idx" ON "landings_seo_robots" USING btree ("order");
  CREATE INDEX "landings_seo_robots_parent_idx" ON "landings_seo_robots" USING btree ("parent_id");
  CREATE INDEX "landings_blocks_hero_order_idx" ON "landings_blocks_hero" USING btree ("_order");
  CREATE INDEX "landings_blocks_hero_parent_id_idx" ON "landings_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_hero_path_idx" ON "landings_blocks_hero" USING btree ("_path");
  CREATE INDEX "landings_blocks_hero_background_image_idx" ON "landings_blocks_hero" USING btree ("background_image_id");
  CREATE UNIQUE INDEX "landings_blocks_hero_locales_locale_parent_id_unique" ON "landings_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_content_order_idx" ON "landings_blocks_content" USING btree ("_order");
  CREATE INDEX "landings_blocks_content_parent_id_idx" ON "landings_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_content_path_idx" ON "landings_blocks_content" USING btree ("_path");
  CREATE UNIQUE INDEX "landings_blocks_content_locales_locale_parent_id_unique" ON "landings_blocks_content_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_image_gallery_images_order_idx" ON "landings_blocks_image_gallery_images" USING btree ("_order");
  CREATE INDEX "landings_blocks_image_gallery_images_parent_id_idx" ON "landings_blocks_image_gallery_images" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_image_gallery_images_image_idx" ON "landings_blocks_image_gallery_images" USING btree ("image_id");
  CREATE INDEX "landings_blocks_image_gallery_order_idx" ON "landings_blocks_image_gallery" USING btree ("_order");
  CREATE INDEX "landings_blocks_image_gallery_parent_id_idx" ON "landings_blocks_image_gallery" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_image_gallery_path_idx" ON "landings_blocks_image_gallery" USING btree ("_path");
  CREATE INDEX "landings_blocks_testimonials_items_order_idx" ON "landings_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "landings_blocks_testimonials_items_parent_id_idx" ON "landings_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_testimonials_items_avatar_idx" ON "landings_blocks_testimonials_items" USING btree ("avatar_id");
  CREATE INDEX "landings_blocks_testimonials_order_idx" ON "landings_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "landings_blocks_testimonials_parent_id_idx" ON "landings_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_testimonials_path_idx" ON "landings_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "landings_blocks_cta_order_idx" ON "landings_blocks_cta" USING btree ("_order");
  CREATE INDEX "landings_blocks_cta_parent_id_idx" ON "landings_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_cta_path_idx" ON "landings_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "landings_blocks_cta_locales_locale_parent_id_unique" ON "landings_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_faq_items_order_idx" ON "landings_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "landings_blocks_faq_items_parent_id_idx" ON "landings_blocks_faq_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "landings_blocks_faq_items_locales_locale_parent_id_unique" ON "landings_blocks_faq_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_faq_order_idx" ON "landings_blocks_faq" USING btree ("_order");
  CREATE INDEX "landings_blocks_faq_parent_id_idx" ON "landings_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_faq_path_idx" ON "landings_blocks_faq" USING btree ("_path");
  CREATE INDEX "landings_blocks_stats_items_order_idx" ON "landings_blocks_stats_items" USING btree ("_order");
  CREATE INDEX "landings_blocks_stats_items_parent_id_idx" ON "landings_blocks_stats_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "landings_blocks_stats_items_locales_locale_parent_id_unique" ON "landings_blocks_stats_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_stats_order_idx" ON "landings_blocks_stats" USING btree ("_order");
  CREATE INDEX "landings_blocks_stats_parent_id_idx" ON "landings_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_stats_path_idx" ON "landings_blocks_stats" USING btree ("_path");
  CREATE INDEX "landings_blocks_pricing_table_columns_features_order_idx" ON "landings_blocks_pricing_table_columns_features" USING btree ("_order");
  CREATE INDEX "landings_blocks_pricing_table_columns_features_parent_id_idx" ON "landings_blocks_pricing_table_columns_features" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_pricing_table_columns_order_idx" ON "landings_blocks_pricing_table_columns" USING btree ("_order");
  CREATE INDEX "landings_blocks_pricing_table_columns_parent_id_idx" ON "landings_blocks_pricing_table_columns" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_pricing_table_order_idx" ON "landings_blocks_pricing_table" USING btree ("_order");
  CREATE INDEX "landings_blocks_pricing_table_parent_id_idx" ON "landings_blocks_pricing_table" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_pricing_table_path_idx" ON "landings_blocks_pricing_table" USING btree ("_path");
  CREATE UNIQUE INDEX "landings_blocks_pricing_table_locales_locale_parent_id_uniqu" ON "landings_blocks_pricing_table_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_blog_feed_order_idx" ON "landings_blocks_blog_feed" USING btree ("_order");
  CREATE INDEX "landings_blocks_blog_feed_parent_id_idx" ON "landings_blocks_blog_feed" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_blog_feed_path_idx" ON "landings_blocks_blog_feed" USING btree ("_path");
  CREATE UNIQUE INDEX "landings_blocks_blog_feed_locales_locale_parent_id_unique" ON "landings_blocks_blog_feed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_offer_cards_cards_order_idx" ON "landings_blocks_offer_cards_cards" USING btree ("_order");
  CREATE INDEX "landings_blocks_offer_cards_cards_parent_id_idx" ON "landings_blocks_offer_cards_cards" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_offer_cards_cards_image_idx" ON "landings_blocks_offer_cards_cards" USING btree ("image_id");
  CREATE INDEX "landings_blocks_offer_cards_order_idx" ON "landings_blocks_offer_cards" USING btree ("_order");
  CREATE INDEX "landings_blocks_offer_cards_parent_id_idx" ON "landings_blocks_offer_cards" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_offer_cards_path_idx" ON "landings_blocks_offer_cards" USING btree ("_path");
  CREATE UNIQUE INDEX "landings_blocks_offer_cards_locales_locale_parent_id_unique" ON "landings_blocks_offer_cards_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_embed_order_idx" ON "landings_blocks_embed" USING btree ("_order");
  CREATE INDEX "landings_blocks_embed_parent_id_idx" ON "landings_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_embed_path_idx" ON "landings_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "landings_blocks_embed_locales_locale_parent_id_unique" ON "landings_blocks_embed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_blocks_divider_order_idx" ON "landings_blocks_divider" USING btree ("_order");
  CREATE INDEX "landings_blocks_divider_parent_id_idx" ON "landings_blocks_divider" USING btree ("_parent_id");
  CREATE INDEX "landings_blocks_divider_path_idx" ON "landings_blocks_divider" USING btree ("_path");
  CREATE INDEX "landings_faq_order_idx" ON "landings_faq" USING btree ("_order");
  CREATE INDEX "landings_faq_parent_id_idx" ON "landings_faq" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "landings_faq_locales_locale_parent_id_unique" ON "landings_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_tenant_idx" ON "landings" USING btree ("tenant_id");
  CREATE INDEX "landings_featured_image_idx" ON "landings" USING btree ("featured_image_id");
  CREATE INDEX "landings_seo_open_graph_seo_open_graph_image_idx" ON "landings" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "landings_seo_open_graph_twitter_meta_seo_open_graph_twit_idx" ON "landings" USING btree ("seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "landings_created_by_idx" ON "landings" USING btree ("created_by_id");
  CREATE INDEX "landings_updated_at_idx" ON "landings" USING btree ("updated_at");
  CREATE INDEX "landings_created_at_idx" ON "landings" USING btree ("created_at");
  CREATE INDEX "landings_deleted_at_idx" ON "landings" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "landings_locales_locale_parent_id_unique" ON "landings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "landings_texts_order_parent" ON "landings_texts" USING btree ("order","parent_id");
  CREATE INDEX "_landings_v_version_seo_breadcrumbs_order_idx" ON "_landings_v_version_seo_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_landings_v_version_seo_breadcrumbs_parent_id_idx" ON "_landings_v_version_seo_breadcrumbs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_landings_v_version_seo_breadcrumbs_locales_locale_parent_id" ON "_landings_v_version_seo_breadcrumbs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_version_seo_robots_order_idx" ON "_landings_v_version_seo_robots" USING btree ("order");
  CREATE INDEX "_landings_v_version_seo_robots_parent_idx" ON "_landings_v_version_seo_robots" USING btree ("parent_id");
  CREATE INDEX "_landings_v_blocks_hero_order_idx" ON "_landings_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_hero_parent_id_idx" ON "_landings_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_hero_path_idx" ON "_landings_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_landings_v_blocks_hero_background_image_idx" ON "_landings_v_blocks_hero" USING btree ("background_image_id");
  CREATE UNIQUE INDEX "_landings_v_blocks_hero_locales_locale_parent_id_unique" ON "_landings_v_blocks_hero_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_content_order_idx" ON "_landings_v_blocks_content" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_content_parent_id_idx" ON "_landings_v_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_content_path_idx" ON "_landings_v_blocks_content" USING btree ("_path");
  CREATE UNIQUE INDEX "_landings_v_blocks_content_locales_locale_parent_id_unique" ON "_landings_v_blocks_content_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_image_gallery_images_order_idx" ON "_landings_v_blocks_image_gallery_images" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_image_gallery_images_parent_id_idx" ON "_landings_v_blocks_image_gallery_images" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_image_gallery_images_image_idx" ON "_landings_v_blocks_image_gallery_images" USING btree ("image_id");
  CREATE INDEX "_landings_v_blocks_image_gallery_order_idx" ON "_landings_v_blocks_image_gallery" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_image_gallery_parent_id_idx" ON "_landings_v_blocks_image_gallery" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_image_gallery_path_idx" ON "_landings_v_blocks_image_gallery" USING btree ("_path");
  CREATE INDEX "_landings_v_blocks_testimonials_items_order_idx" ON "_landings_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_testimonials_items_parent_id_idx" ON "_landings_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_testimonials_items_avatar_idx" ON "_landings_v_blocks_testimonials_items" USING btree ("avatar_id");
  CREATE INDEX "_landings_v_blocks_testimonials_order_idx" ON "_landings_v_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_testimonials_parent_id_idx" ON "_landings_v_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_testimonials_path_idx" ON "_landings_v_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "_landings_v_blocks_cta_order_idx" ON "_landings_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_cta_parent_id_idx" ON "_landings_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_cta_path_idx" ON "_landings_v_blocks_cta" USING btree ("_path");
  CREATE UNIQUE INDEX "_landings_v_blocks_cta_locales_locale_parent_id_unique" ON "_landings_v_blocks_cta_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_faq_items_order_idx" ON "_landings_v_blocks_faq_items" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_faq_items_parent_id_idx" ON "_landings_v_blocks_faq_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_landings_v_blocks_faq_items_locales_locale_parent_id_unique" ON "_landings_v_blocks_faq_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_faq_order_idx" ON "_landings_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_faq_parent_id_idx" ON "_landings_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_faq_path_idx" ON "_landings_v_blocks_faq" USING btree ("_path");
  CREATE INDEX "_landings_v_blocks_stats_items_order_idx" ON "_landings_v_blocks_stats_items" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_stats_items_parent_id_idx" ON "_landings_v_blocks_stats_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_landings_v_blocks_stats_items_locales_locale_parent_id_uniq" ON "_landings_v_blocks_stats_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_stats_order_idx" ON "_landings_v_blocks_stats" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_stats_parent_id_idx" ON "_landings_v_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_stats_path_idx" ON "_landings_v_blocks_stats" USING btree ("_path");
  CREATE INDEX "_landings_v_blocks_pricing_table_columns_features_order_idx" ON "_landings_v_blocks_pricing_table_columns_features" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_pricing_table_columns_features_parent_id_idx" ON "_landings_v_blocks_pricing_table_columns_features" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_pricing_table_columns_order_idx" ON "_landings_v_blocks_pricing_table_columns" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_pricing_table_columns_parent_id_idx" ON "_landings_v_blocks_pricing_table_columns" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_pricing_table_order_idx" ON "_landings_v_blocks_pricing_table" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_pricing_table_parent_id_idx" ON "_landings_v_blocks_pricing_table" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_pricing_table_path_idx" ON "_landings_v_blocks_pricing_table" USING btree ("_path");
  CREATE UNIQUE INDEX "_landings_v_blocks_pricing_table_locales_locale_parent_id_un" ON "_landings_v_blocks_pricing_table_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_blog_feed_order_idx" ON "_landings_v_blocks_blog_feed" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_blog_feed_parent_id_idx" ON "_landings_v_blocks_blog_feed" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_blog_feed_path_idx" ON "_landings_v_blocks_blog_feed" USING btree ("_path");
  CREATE UNIQUE INDEX "_landings_v_blocks_blog_feed_locales_locale_parent_id_unique" ON "_landings_v_blocks_blog_feed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_offer_cards_cards_order_idx" ON "_landings_v_blocks_offer_cards_cards" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_offer_cards_cards_parent_id_idx" ON "_landings_v_blocks_offer_cards_cards" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_offer_cards_cards_image_idx" ON "_landings_v_blocks_offer_cards_cards" USING btree ("image_id");
  CREATE INDEX "_landings_v_blocks_offer_cards_order_idx" ON "_landings_v_blocks_offer_cards" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_offer_cards_parent_id_idx" ON "_landings_v_blocks_offer_cards" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_offer_cards_path_idx" ON "_landings_v_blocks_offer_cards" USING btree ("_path");
  CREATE UNIQUE INDEX "_landings_v_blocks_offer_cards_locales_locale_parent_id_uniq" ON "_landings_v_blocks_offer_cards_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_embed_order_idx" ON "_landings_v_blocks_embed" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_embed_parent_id_idx" ON "_landings_v_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_embed_path_idx" ON "_landings_v_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "_landings_v_blocks_embed_locales_locale_parent_id_unique" ON "_landings_v_blocks_embed_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_blocks_divider_order_idx" ON "_landings_v_blocks_divider" USING btree ("_order");
  CREATE INDEX "_landings_v_blocks_divider_parent_id_idx" ON "_landings_v_blocks_divider" USING btree ("_parent_id");
  CREATE INDEX "_landings_v_blocks_divider_path_idx" ON "_landings_v_blocks_divider" USING btree ("_path");
  CREATE INDEX "_landings_v_version_faq_order_idx" ON "_landings_v_version_faq" USING btree ("_order");
  CREATE INDEX "_landings_v_version_faq_parent_id_idx" ON "_landings_v_version_faq" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_landings_v_version_faq_locales_locale_parent_id_unique" ON "_landings_v_version_faq_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_parent_idx" ON "_landings_v" USING btree ("parent_id");
  CREATE INDEX "_landings_v_version_version_tenant_idx" ON "_landings_v" USING btree ("version_tenant_id");
  CREATE INDEX "_landings_v_version_version_featured_image_idx" ON "_landings_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_landings_v_version_seo_open_graph_version_seo_open_grap_idx" ON "_landings_v" USING btree ("version_seo_open_graph_image_id");
  CREATE INDEX "_landings_v_version_seo_open_graph_twitter_meta_version__idx" ON "_landings_v" USING btree ("version_seo_open_graph_twitter_meta_image_id");
  CREATE INDEX "_landings_v_version_version_created_by_idx" ON "_landings_v" USING btree ("version_created_by_id");
  CREATE INDEX "_landings_v_version_version_updated_at_idx" ON "_landings_v" USING btree ("version_updated_at");
  CREATE INDEX "_landings_v_version_version_created_at_idx" ON "_landings_v" USING btree ("version_created_at");
  CREATE INDEX "_landings_v_version_version_deleted_at_idx" ON "_landings_v" USING btree ("version_deleted_at");
  CREATE INDEX "_landings_v_created_at_idx" ON "_landings_v" USING btree ("created_at");
  CREATE INDEX "_landings_v_updated_at_idx" ON "_landings_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_landings_v_locales_locale_parent_id_unique" ON "_landings_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_landings_v_texts_order_parent" ON "_landings_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "shortcodes_tenant_idx" ON "shortcodes" USING btree ("tenant_id");
  CREATE INDEX "shortcodes_name_idx" ON "shortcodes" USING btree ("name");
  CREATE INDEX "shortcodes_updated_at_idx" ON "shortcodes" USING btree ("updated_at");
  CREATE INDEX "shortcodes_created_at_idx" ON "shortcodes" USING btree ("created_at");
  CREATE INDEX "shortcodes_deleted_at_idx" ON "shortcodes" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "shortcodes_locales_locale_parent_id_unique" ON "shortcodes_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_shortcodes_v_parent_idx" ON "_shortcodes_v" USING btree ("parent_id");
  CREATE INDEX "_shortcodes_v_version_version_tenant_idx" ON "_shortcodes_v" USING btree ("version_tenant_id");
  CREATE INDEX "_shortcodes_v_version_version_name_idx" ON "_shortcodes_v" USING btree ("version_name");
  CREATE INDEX "_shortcodes_v_version_version_updated_at_idx" ON "_shortcodes_v" USING btree ("version_updated_at");
  CREATE INDEX "_shortcodes_v_version_version_created_at_idx" ON "_shortcodes_v" USING btree ("version_created_at");
  CREATE INDEX "_shortcodes_v_version_version_deleted_at_idx" ON "_shortcodes_v" USING btree ("version_deleted_at");
  CREATE INDEX "_shortcodes_v_created_at_idx" ON "_shortcodes_v" USING btree ("created_at");
  CREATE INDEX "_shortcodes_v_updated_at_idx" ON "_shortcodes_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_shortcodes_v_locales_locale_parent_id_unique" ON "_shortcodes_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "redirects_tenant_idx" ON "redirects" USING btree ("tenant_id");
  CREATE INDEX "redirects_updated_at_idx" ON "redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "redirects" USING btree ("created_at");
  CREATE INDEX "rating_events_updated_at_idx" ON "rating_events" USING btree ("updated_at");
  CREATE INDEX "rating_events_created_at_idx" ON "rating_events" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_folders_folder_type_order_idx" ON "payload_folders_folder_type" USING btree ("order");
  CREATE INDEX "payload_folders_folder_type_parent_idx" ON "payload_folders_folder_type" USING btree ("parent_id");
  CREATE INDEX "payload_folders_name_idx" ON "payload_folders" USING btree ("name");
  CREATE INDEX "payload_folders_folder_idx" ON "payload_folders" USING btree ("folder_id");
  CREATE INDEX "payload_folders_tenant_idx" ON "payload_folders" USING btree ("tenant_id");
  CREATE INDEX "payload_folders_updated_at_idx" ON "payload_folders" USING btree ("updated_at");
  CREATE INDEX "payload_folders_created_at_idx" ON "payload_folders" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("sites_id");
  CREATE INDEX "payload_locked_documents_rels_taxonomies_id_idx" ON "payload_locked_documents_rels" USING btree ("taxonomies_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_menus_id_idx" ON "payload_locked_documents_rels" USING btree ("menus_id");
  CREATE INDEX "payload_locked_documents_rels_faqs_id_idx" ON "payload_locked_documents_rels" USING btree ("faqs_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_landings_id_idx" ON "payload_locked_documents_rels" USING btree ("landings_id");
  CREATE INDEX "payload_locked_documents_rels_shortcodes_id_idx" ON "payload_locked_documents_rels" USING btree ("shortcodes_id");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("redirects_id");
  CREATE INDEX "payload_locked_documents_rels_rating_events_id_idx" ON "payload_locked_documents_rels" USING btree ("rating_events_id");
  CREATE INDEX "payload_locked_documents_rels_payload_folders_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_folders_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)

  // ── Hand-written constraints/indexes (not derivable from the Payload schema) ──
  // Per-site slug uniqueness is PARTIAL (active rows only): a trashed document keeps its slug and a
  // replacement may reuse it. Restoring the original while the slug is taken is refused by the
  // `guard-restore-slug-conflict` hook with a readable message.
  await db.execute(sql`
  CREATE UNIQUE INDEX "pages_tenant_slug_unique" ON "pages" USING btree ("tenant_id", "slug") WHERE "deleted_at" IS NULL;
  CREATE UNIQUE INDEX "posts_tenant_slug_unique" ON "posts" USING btree ("tenant_id", "slug") WHERE "deleted_at" IS NULL;
  CREATE UNIQUE INDEX "landings_tenant_slug_unique" ON "landings" USING btree ("tenant_id", "slug") WHERE "deleted_at" IS NULL;
  CREATE UNIQUE INDEX "products_tenant_slug_unique" ON "products" USING btree ("tenant_id", "slug") WHERE "deleted_at" IS NULL;
  CREATE UNIQUE INDEX "shortcodes_tenant_name_unique" ON "shortcodes" USING btree ("tenant_id", "name") WHERE "deleted_at" IS NULL;
  -- Taxonomy slugs are unique per (site, type): different types may share a slug.
  CREATE UNIQUE INDEX "taxonomies_tenant_type_slug_unique" ON "taxonomies" USING btree ("tenant_id", "type", "slug");
  -- Redirect sources are unique per site.
  CREATE UNIQUE INDEX "redirects_tenant_from_unique" ON "redirects" USING btree ("tenant_id", "from");`)

  // Composite indexes for the public listing queries a frontend runs on every request:
  // WHERE tenant_id = $1 AND status = 'published' ORDER BY published_at DESC.
  await db.execute(sql`
  CREATE INDEX "posts_tenant_status_published_at_idx" ON "posts" USING btree ("tenant_id", "status", "published_at" DESC);
  CREATE INDEX "pages_tenant_status_published_at_idx" ON "pages" USING btree ("tenant_id", "status", "published_at" DESC);
  CREATE INDEX "products_tenant_status_published_at_idx" ON "products" USING btree ("tenant_id", "status", "published_at" DESC);
  CREATE INDEX "landings_tenant_status_published_at_idx" ON "landings" USING btree ("tenant_id", "status", "published_at" DESC);
  CREATE INDEX "redirects_tenant_enabled_idx" ON "redirects" USING btree ("tenant_id", "is_enabled");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_tenants" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "sites_landing_slider" CASCADE;
  DROP TABLE "sites_home_page_highlight" CASCADE;
  DROP TABLE "sites_home_page_highlight_locales" CASCADE;
  DROP TABLE "sites_contact_right_side" CASCADE;
  DROP TABLE "sites_contact_right_side_locales" CASCADE;
  DROP TABLE "sites_contact_header_icons" CASCADE;
  DROP TABLE "sites_contact_header_icons_locales" CASCADE;
  DROP TABLE "sites_footer_address" CASCADE;
  DROP TABLE "sites_footer_ecosystem_links" CASCADE;
  DROP TABLE "sites_footer_ecosystem_links_locales" CASCADE;
  DROP TABLE "sites_footer_partners" CASCADE;
  DROP TABLE "sites_page_group" CASCADE;
  DROP TABLE "sites_page_group_locales" CASCADE;
  DROP TABLE "sites_knowledge_graph_opening_hours_day_of_week" CASCADE;
  DROP TABLE "sites_knowledge_graph_opening_hours" CASCADE;
  DROP TABLE "sites_knowledge_graph_founders" CASCADE;
  DROP TABLE "sites_knowledge_graph_area_served" CASCADE;
  DROP TABLE "sites_knowledge_graph_knows_language" CASCADE;
  DROP TABLE "sites_knowledge_graph_contact_point_available_language" CASCADE;
  DROP TABLE "sites_knowledge_graph_additional_offices" CASCADE;
  DROP TABLE "sites_social_profiles" CASCADE;
  DROP TABLE "sites" CASCADE;
  DROP TABLE "sites_locales" CASCADE;
  DROP TABLE "sites_rels" CASCADE;
  DROP TABLE "taxonomies_seo_breadcrumbs" CASCADE;
  DROP TABLE "taxonomies_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "taxonomies_seo_robots" CASCADE;
  DROP TABLE "taxonomies" CASCADE;
  DROP TABLE "taxonomies_locales" CASCADE;
  DROP TABLE "taxonomies_texts" CASCADE;
  DROP TABLE "_taxonomies_v_version_seo_breadcrumbs" CASCADE;
  DROP TABLE "_taxonomies_v_version_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "_taxonomies_v_version_seo_robots" CASCADE;
  DROP TABLE "_taxonomies_v" CASCADE;
  DROP TABLE "_taxonomies_v_locales" CASCADE;
  DROP TABLE "_taxonomies_v_texts" CASCADE;
  DROP TABLE "authors_same_as" CASCADE;
  DROP TABLE "authors" CASCADE;
  DROP TABLE "authors_locales" CASCADE;
  DROP TABLE "menus_items_children" CASCADE;
  DROP TABLE "menus_items_children_locales" CASCADE;
  DROP TABLE "menus_items" CASCADE;
  DROP TABLE "menus_items_locales" CASCADE;
  DROP TABLE "menus" CASCADE;
  DROP TABLE "faqs_items" CASCADE;
  DROP TABLE "faqs_items_locales" CASCADE;
  DROP TABLE "faqs" CASCADE;
  DROP TABLE "_faqs_v_version_items" CASCADE;
  DROP TABLE "_faqs_v_version_items_locales" CASCADE;
  DROP TABLE "_faqs_v" CASCADE;
  DROP TABLE "pages_seo_breadcrumbs" CASCADE;
  DROP TABLE "pages_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "pages_seo_robots" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "pages_texts" CASCADE;
  DROP TABLE "pages_rels" CASCADE;
  DROP TABLE "_pages_v_version_seo_breadcrumbs" CASCADE;
  DROP TABLE "_pages_v_version_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "_pages_v_version_seo_robots" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "_pages_v_texts" CASCADE;
  DROP TABLE "_pages_v_rels" CASCADE;
  DROP TABLE "posts_seo_breadcrumbs" CASCADE;
  DROP TABLE "posts_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "posts_seo_robots" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_locales" CASCADE;
  DROP TABLE "posts_texts" CASCADE;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v_version_seo_breadcrumbs" CASCADE;
  DROP TABLE "_posts_v_version_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "_posts_v_version_seo_robots" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_locales" CASCADE;
  DROP TABLE "_posts_v_texts" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "products_hero_slider" CASCADE;
  DROP TABLE "products_prices" CASCADE;
  DROP TABLE "products_seo_breadcrumbs" CASCADE;
  DROP TABLE "products_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "products_seo_robots" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_locales" CASCADE;
  DROP TABLE "products_texts" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "_products_v_version_hero_slider" CASCADE;
  DROP TABLE "_products_v_version_prices" CASCADE;
  DROP TABLE "_products_v_version_seo_breadcrumbs" CASCADE;
  DROP TABLE "_products_v_version_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "_products_v_version_seo_robots" CASCADE;
  DROP TABLE "_products_v" CASCADE;
  DROP TABLE "_products_v_locales" CASCADE;
  DROP TABLE "_products_v_texts" CASCADE;
  DROP TABLE "_products_v_rels" CASCADE;
  DROP TABLE "landings_seo_breadcrumbs" CASCADE;
  DROP TABLE "landings_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "landings_seo_robots" CASCADE;
  DROP TABLE "landings_blocks_hero" CASCADE;
  DROP TABLE "landings_blocks_hero_locales" CASCADE;
  DROP TABLE "landings_blocks_content" CASCADE;
  DROP TABLE "landings_blocks_content_locales" CASCADE;
  DROP TABLE "landings_blocks_image_gallery_images" CASCADE;
  DROP TABLE "landings_blocks_image_gallery" CASCADE;
  DROP TABLE "landings_blocks_testimonials_items" CASCADE;
  DROP TABLE "landings_blocks_testimonials" CASCADE;
  DROP TABLE "landings_blocks_cta" CASCADE;
  DROP TABLE "landings_blocks_cta_locales" CASCADE;
  DROP TABLE "landings_blocks_faq_items" CASCADE;
  DROP TABLE "landings_blocks_faq_items_locales" CASCADE;
  DROP TABLE "landings_blocks_faq" CASCADE;
  DROP TABLE "landings_blocks_stats_items" CASCADE;
  DROP TABLE "landings_blocks_stats_items_locales" CASCADE;
  DROP TABLE "landings_blocks_stats" CASCADE;
  DROP TABLE "landings_blocks_pricing_table_columns_features" CASCADE;
  DROP TABLE "landings_blocks_pricing_table_columns" CASCADE;
  DROP TABLE "landings_blocks_pricing_table" CASCADE;
  DROP TABLE "landings_blocks_pricing_table_locales" CASCADE;
  DROP TABLE "landings_blocks_blog_feed" CASCADE;
  DROP TABLE "landings_blocks_blog_feed_locales" CASCADE;
  DROP TABLE "landings_blocks_offer_cards_cards" CASCADE;
  DROP TABLE "landings_blocks_offer_cards" CASCADE;
  DROP TABLE "landings_blocks_offer_cards_locales" CASCADE;
  DROP TABLE "landings_blocks_embed" CASCADE;
  DROP TABLE "landings_blocks_embed_locales" CASCADE;
  DROP TABLE "landings_blocks_divider" CASCADE;
  DROP TABLE "landings_faq" CASCADE;
  DROP TABLE "landings_faq_locales" CASCADE;
  DROP TABLE "landings" CASCADE;
  DROP TABLE "landings_locales" CASCADE;
  DROP TABLE "landings_texts" CASCADE;
  DROP TABLE "_landings_v_version_seo_breadcrumbs" CASCADE;
  DROP TABLE "_landings_v_version_seo_breadcrumbs_locales" CASCADE;
  DROP TABLE "_landings_v_version_seo_robots" CASCADE;
  DROP TABLE "_landings_v_blocks_hero" CASCADE;
  DROP TABLE "_landings_v_blocks_hero_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_content" CASCADE;
  DROP TABLE "_landings_v_blocks_content_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_image_gallery_images" CASCADE;
  DROP TABLE "_landings_v_blocks_image_gallery" CASCADE;
  DROP TABLE "_landings_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "_landings_v_blocks_testimonials" CASCADE;
  DROP TABLE "_landings_v_blocks_cta" CASCADE;
  DROP TABLE "_landings_v_blocks_cta_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_faq_items" CASCADE;
  DROP TABLE "_landings_v_blocks_faq_items_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_faq" CASCADE;
  DROP TABLE "_landings_v_blocks_stats_items" CASCADE;
  DROP TABLE "_landings_v_blocks_stats_items_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_stats" CASCADE;
  DROP TABLE "_landings_v_blocks_pricing_table_columns_features" CASCADE;
  DROP TABLE "_landings_v_blocks_pricing_table_columns" CASCADE;
  DROP TABLE "_landings_v_blocks_pricing_table" CASCADE;
  DROP TABLE "_landings_v_blocks_pricing_table_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_blog_feed" CASCADE;
  DROP TABLE "_landings_v_blocks_blog_feed_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_offer_cards_cards" CASCADE;
  DROP TABLE "_landings_v_blocks_offer_cards" CASCADE;
  DROP TABLE "_landings_v_blocks_offer_cards_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_embed" CASCADE;
  DROP TABLE "_landings_v_blocks_embed_locales" CASCADE;
  DROP TABLE "_landings_v_blocks_divider" CASCADE;
  DROP TABLE "_landings_v_version_faq" CASCADE;
  DROP TABLE "_landings_v_version_faq_locales" CASCADE;
  DROP TABLE "_landings_v" CASCADE;
  DROP TABLE "_landings_v_locales" CASCADE;
  DROP TABLE "_landings_v_texts" CASCADE;
  DROP TABLE "shortcodes" CASCADE;
  DROP TABLE "shortcodes_locales" CASCADE;
  DROP TABLE "_shortcodes_v" CASCADE;
  DROP TABLE "_shortcodes_v_locales" CASCADE;
  DROP TABLE "redirects" CASCADE;
  DROP TABLE "rating_events" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_folders_folder_type" CASCADE;
  DROP TABLE "payload_folders" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_sites_contact_right_side_icon";
  DROP TYPE "public"."enum_sites_page_group_key";
  DROP TYPE "public"."enum_sites_knowledge_graph_opening_hours_day_of_week";
  DROP TYPE "public"."enum_sites_knowledge_graph_area_served_type";
  DROP TYPE "public"."enum_sites_knowledge_graph_knows_language";
  DROP TYPE "public"."enum_sites_knowledge_graph_contact_point_available_language";
  DROP TYPE "public"."enum_sites_social_profiles_platform";
  DROP TYPE "public"."enum_sites_default_language";
  DROP TYPE "public"."enum_sites_theme";
  DROP TYPE "public"."enum_sites_landing_hero_notice1_icon";
  DROP TYPE "public"."enum_sites_landing_hero_notice2_icon";
  DROP TYPE "public"."enum_sites_knowledge_graph_type";
  DROP TYPE "public"."enum_sites_knowledge_graph_business_type";
  DROP TYPE "public"."enum_sites_knowledge_graph_contact_point_contact_type";
  DROP TYPE "public"."enum_sites_seo_titles_separator";
  DROP TYPE "public"."enum_sites_breadcrumbs_primary_taxonomy_product";
  DROP TYPE "public"."enum_sites_breadcrumbs_primary_taxonomy_post";
  DROP TYPE "public"."enum_sites_manifest_display";
  DROP TYPE "public"."enum_taxonomies_seo_robots";
  DROP TYPE "public"."enum_taxonomies_type";
  DROP TYPE "public"."enum_taxonomies_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum__taxonomies_v_version_seo_robots";
  DROP TYPE "public"."enum__taxonomies_v_version_type";
  DROP TYPE "public"."enum__taxonomies_v_version_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum_menus_location";
  DROP TYPE "public"."enum_pages_seo_robots";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum_pages_page_type";
  DROP TYPE "public"."enum_pages_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum__pages_v_version_seo_robots";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_version_page_type";
  DROP TYPE "public"."enum__pages_v_version_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum_posts_seo_robots";
  DROP TYPE "public"."enum_posts_type";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum_posts_tier";
  DROP TYPE "public"."enum_posts_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum__posts_v_version_seo_robots";
  DROP TYPE "public"."enum__posts_v_version_type";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum__posts_v_version_tier";
  DROP TYPE "public"."enum__posts_v_version_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum_comments_status";
  DROP TYPE "public"."enum_products_prices_currency";
  DROP TYPE "public"."enum_products_seo_robots";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum_products_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum__products_v_version_prices_currency";
  DROP TYPE "public"."enum__products_v_version_seo_robots";
  DROP TYPE "public"."enum__products_v_version_status";
  DROP TYPE "public"."enum__products_v_version_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum_landings_seo_robots";
  DROP TYPE "public"."enum_landings_blocks_cta_style";
  DROP TYPE "public"."enum_landings_blocks_divider_style";
  DROP TYPE "public"."enum_landings_blocks_divider_spacing";
  DROP TYPE "public"."enum_landings_status";
  DROP TYPE "public"."enum_landings_template";
  DROP TYPE "public"."enum_landings_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum_landings_schema_type";
  DROP TYPE "public"."enum__landings_v_version_seo_robots";
  DROP TYPE "public"."enum__landings_v_blocks_cta_style";
  DROP TYPE "public"."enum__landings_v_blocks_divider_style";
  DROP TYPE "public"."enum__landings_v_blocks_divider_spacing";
  DROP TYPE "public"."enum__landings_v_version_status";
  DROP TYPE "public"."enum__landings_v_version_template";
  DROP TYPE "public"."enum__landings_v_version_seo_open_graph_twitter_meta_card";
  DROP TYPE "public"."enum__landings_v_version_schema_type";
  DROP TYPE "public"."enum_redirects_status_code";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_payload_folders_folder_type";`)
}
