import { toWords } from 'payload/shared'

// Display metadata only. Never translate document content, field names or enum values.
const VI: Record<string, string> = {
  'Ab Test Id': 'Mã thử nghiệm A/B', 'Access Key Id': 'Mã khóa truy cập', 'Access Key Id Editor': 'Khóa truy cập',
  'Account Id': 'Mã tài khoản', 'Additional Offices': 'Văn phòng khác', Address: 'Địa chỉ',
  'Address Country': 'Quốc gia', 'Address Locality': 'Quận / huyện', 'Address Region': 'Tỉnh / thành phố',
  'Advanced SEO': 'SEO nâng cao', 'Aggregate Rating Override': 'Ghi đè đánh giá tổng hợp',
  'Ai Desc Btn': 'Tạo mô tả bằng AI', 'Ai Faq Btn': 'Tạo câu hỏi bằng AI', 'Ai Og Alt Btn': 'Tạo mô tả ảnh bằng AI', 'Ai Title Btn': 'Tạo tiêu đề bằng AI',
  Alt: 'Mô tả ảnh', Answer: 'Trả lời', 'Api Key': 'Khóa API', 'Api Key Editor': 'Khóa API', 'Api Token': 'Token API',
  'Area Served': 'Khu vực phục vụ', Author: 'Tác giả', 'Author Email': 'Email tác giả', 'Author Name': 'Tên tác giả',
  'Available Language': 'Ngôn ngữ hỗ trợ', Avatar: 'Ảnh đại diện', Avg: 'Trung bình', 'Background Image': 'Ảnh nền',
  'Base Url': 'URL gốc', Bio: 'Giới thiệu', 'Block Name': 'Tên khối', 'Body Md': 'Nội dung', 
  Branding: 'Thương hiệu', Bucket: 'Kho lưu trữ', 'Business Type': 'Loại hình doanh nghiệp',
  'Button Text': 'Nhãn nút', 'Button Url': 'URL nút', Campaign: 'Chiến dịch', 'Canonical Override': 'URL chuẩn tùy chỉnh',
  Card: 'Thẻ', Cards: 'Các thẻ', Categories: 'Chuyên mục', Category: 'Chuyên mục', 'Clarity Id': 'Mã Clarity',
  Closes: 'Giờ đóng cửa', 'Cloudflare R2 (Storage)': 'Cloudflare R2 (lưu trữ)', Cluster: 'Cụm nội dung', Code: 'Mã',
  Collection: 'Loại nội dung', Columns: 'Các cột', 'Comment Count': 'Số bình luận', 'Compress To Webp': 'Nén sang WebP',
  Contact: 'Liên hệ', 'Contact Type': 'Loại liên hệ', Content: 'Nội dung', 'Content Id': 'Mã nội dung',
  'Content Md': 'Nội dung', 'Content Word Count': 'Số từ nội dung', 'Conversion Goal': 'Mục tiêu chuyển đổi',
  Count: 'Số lượng', Counts: 'Thống kê số lượng', 'Created At': 'Ngày tạo', 'Updated At': 'Ngày cập nhật',
  'Cta Text': 'Nhãn kêu gọi hành động', 'Cta Url': 'URL kêu gọi hành động', 'Current Price': 'Giá hiện tại',
  'Current Step': 'Bước hiện tại', 'Day Of Week': 'Ngày trong tuần', 'Default Language': 'Ngôn ngữ mặc định',
  Description: 'Mô tả', 'Description Template': 'Mẫu mô tả', 
  Discount: 'Giảm giá', Display: 'Hiển thị', 'Display Voucher Suggestion': 'Hiển thị gợi ý mã giảm giá',
  'Doc Meta': 'Thông tin tài liệu', Domain: 'Tên miền', 'Duplicate Action': 'Nhân bản',
  'Ecosystem Links': 'Liên kết hệ sinh thái', Errors: 'Lỗi', Excerpt: 'Tóm tắt', 'Expiry Date': 'Ngày hết hạn',
  'External Url': 'URL bên ngoài', 'Fake Book Number': 'Số lượt đặt hiển thị', Faq: 'Câu hỏi thường gặp', Faqs: 'Câu hỏi thường gặp',
  FAQ: 'Câu hỏi thường gặp', FAQs: 'Câu hỏi thường gặp', Favicon: 'Biểu tượng website', Feature: 'Tính năng',
  'Feature flags': 'Bật / tắt tính năng', 'Featured Image': 'Ảnh đại diện', 'Featured Posts': 'Bài viết nổi bật',
  'Featured Products': 'Sản phẩm nổi bật', Features: 'Tính năng', 
  Field: 'Trường dữ liệu', 
  Flags: 'Cờ hiển thị', 'Focus Keywords': 'Từ khóa trọng tâm', Folder: 'Thư mục', Folders: 'Thư mục', 'Font Family': 'Phông chữ',
  Footer: 'Chân trang', Founders: 'Người sáng lập', 'Founding Date': 'Ngày thành lập', From: 'Từ',
  'Ga4 Id': 'Mã GA4', 'Gbp Map Embed': 'Bản đồ Google nhúng', 'Gbp Place Id': 'Mã địa điểm Google', Group: 'Nhóm',
  'Gtm Id': 'Mã GTM', 'Header Icons': 'Biểu tượng đầu trang', Hero: 'Khu vực nổi bật',
  'Hero Notice1': 'Thông báo nổi bật 1', 'Hero Notice1 Icon': 'Biểu tượng thông báo 1',
  'Hero Notice2': 'Thông báo nổi bật 2', 'Hero Notice2 Icon': 'Biểu tượng thông báo 2', 'Hero Title': 'Tiêu đề nổi bật',
  Highlighted: 'Nổi bật', 'Home Page Highlight': 'Nổi bật trên trang chủ',
  'Hours Available': 'Giờ phục vụ', Html: 'HTML', Icon: 'Biểu tượng', Image: 'Ảnh', 'Image Alt': 'Mô tả ảnh', Images: 'Các ảnh',
  Integration: 'Tích hợp', 'Internal Link Suggester': 'Gợi ý liên kết nội bộ', 'Ip Hash': 'Mã băm IP',
  'Is Disabled': 'Đã tắt', 'Is Enabled': 'Đang bật', 'Is Notified': 'Đã thông báo', 'Is Pillar Page': 'Trang trụ cột',
  'Is Visible': 'Hiển thị', Item: 'Mục', Items: 'Các mục', Key: 'Khóa', 'Kk Star Rating': 'Đánh giá sao', 'Knows Language': 'Ngôn ngữ sử dụng',
  Label: 'Nhãn', Landing: 'Trang đích', Latitude: 'Vĩ độ', Layout: 'Bố cục', 'Legal Name': 'Tên pháp lý', Limit: 'Giới hạn',
  Link: 'Liên kết', 'Link Post': 'Bài viết liên kết', Locale: 'Ngôn ngữ nội dung', Location: 'Địa điểm', 'Location Id': 'Mã địa điểm',
  Longitude: 'Kinh độ', Manifest: 'Cấu hình ứng dụng', 'Min Reviews For Aggregate': 'Số đánh giá tối thiểu để tổng hợp',
  Modified: 'Ngày chỉnh sửa', Name: 'Tên', 'Not Found Image': 'Ảnh trang không tìm thấy', Notice: 'Thông báo', 'Notice Md': 'Thông báo',
  'Og Image': 'Ảnh chia sẻ', 'Opening Hours': 'Giờ mở cửa', Opens: 'Giờ mở cửa', 
  
  Order: 'Thứ tự', Original: 'Bản gốc',
  'Original Price': 'Giá gốc', 'PWA Manifest': 'Cấu hình ứng dụng PWA', 'Page Group': 'Nhóm trang', 'Page Slug': 'Đường dẫn trang',
  'Page Type': 'Loại trang', Parent: 'Mục cha', Partners: 'Đối tác', 'Payment Qr': 'QR thanh toán', Platform: 'Nền tảng',
  Post: 'Bài viết', 'Postal Code': 'Mã bưu chính', Price: 'Giá', 'Price Range': 'Khoảng giá', Prices: 'Bảng giá',
  'Primary Color': 'Màu chủ đạo', 'Primary Taxonomy Post': 'Phân loại chính của bài viết',
  'Primary Taxonomy Product': 'Phân loại chính của sản phẩm', Product: 'Sản phẩm', 'Public Base Url': 'URL công khai gốc',
  'Published At': 'Ngày xuất bản', 'Qr Image': 'Ảnh mã QR', Question: 'Câu hỏi', Quote: 'Trích dẫn',
  Rating: 'Đánh giá', Ratings: 'Các đánh giá', 'Return Policy Url': 'URL chính sách hoàn trả', Rewritten: 'Bản viết lại',
  'Right Side': 'Cột phải', Role: 'Vai trò', 
  'Same As': 'Liên kết xác thực',
  'Schema Type': 'Loại schema', Scope: 'Phạm vi', 'Search Action Url': 'URL tìm kiếm', 'Search Embed': 'Mã nhúng tìm kiếm',
  'Secret Access Key': 'Khóa truy cập bí mật', 'Secret Access Key Editor': 'Khóa truy cập bí mật', Seo: 'SEO',
  'Seo Analysis': 'Phân tích SEO', 'Seo Defaults': 'SEO mặc định', 'Seo List Cell': 'SEO', Separator: 'Dấu phân cách',
  'Short Name': 'Tên ngắn', Sidebar: 'Thanh bên', 'Site Key': 'Mã website', 'Sitemap Priority': 'Độ ưu tiên sitemap',
  'Slide Video': 'Video trình chiếu', Slider: 'Trình chiếu', Slug: 'Đường dẫn', 
  Spacing: 'Khoảng cách', 'Start Url': 'URL khởi động', 'Started At': 'Thời điểm bắt đầu', Status: 'Trạng thái',
  'Status Code': 'Mã trạng thái', 'Street Address': 'Địa chỉ đường phố', Style: 'Kiểu hiển thị', Subfooter: 'Cuối chân trang',
  Subtitle: 'Tiêu đề phụ', 'Tag Snippet': 'Đoạn mã theo dõi', 'Target Collection': 'Loại nội dung đích',
  Telephone: 'Số điện thoại', 'Telephone E164': 'Điện thoại (E.164)', Template: 'Mẫu', Tenant: 'Website', Tenants: 'Website',
  Text: 'Văn bản', Theme: 'Giao diện', 'Thumb Preview': 'Ảnh thu nhỏ', Tier: 'Cấp nội dung', 'Tiktok Url': 'URL TikTok',
  Title: 'Tiêu đề', 'Title Template': 'Mẫu tiêu đề', To: 'Đến', Tooltip: 'Chú thích', Tree: 'Cây điều hướng',
  'Twitter Meta': 'Thông tin chia sẻ X', Type: 'Loại', Url: 'URL', 'Use Facebook Data': 'Dùng dữ liệu Facebook',
  'Utm Campaign': 'Chiến dịch UTM', 'Utm Medium': 'Phương tiện UTM', 'Utm Source': 'Nguồn UTM', 'Valid Until': 'Có hiệu lực đến',
  Value: 'Giá trị', 'View Mode': 'Chế độ xem', 'Webp Quality': 'Chất lượng WebP', 'Widget sidebar': 'Tiện ích thanh bên',
  'Wikidata Id': 'Mã Wikidata', 'Wikipedia Url': 'URL Wikipedia', 'Word Count': 'Số từ',
  'Youtube Channel Url': 'URL kênh YouTube', 'Zone Id': 'Mã vùng', Taxonomy: 'Phân loại', Taxonomies: 'Phân loại',
  Menus: 'Menu điều hướng', Menu: 'Menu điều hướng', Websites: 'Website', 'Thư viện Media': 'Thư viện ảnh', Media: 'Tệp đa phương tiện',
  Draft: 'Bản nháp', Published: 'Đã xuất bản', Archived: 'Lưu trữ', Spam: 'Rác', 'Super Admin': 'Quản trị hệ thống',
  'Product Category': 'Danh mục sản phẩm', Tag: 'Thẻ',
  'Tier 1 (pillar/featured)': 'Cấp 1 (trụ cột / nổi bật)', 'Tier 2 (cluster main)': 'Cấp 2 (cụm chính)', 'Tier 3 (long-tail)': 'Cấp 3 (chuyên sâu)',
  Primary: 'Chính', Secondary: 'Phụ', Outline: 'Viền', Small: 'Nhỏ', Medium: 'Vừa', Large: 'Lớn',
  Default: 'Mặc định', Wide: 'Rộng', Mobile: 'Di động', Fullscreen: 'Toàn màn hình', 'Minimal UI': 'Giao diện tối giản',
  Solid: 'Liền', Dashed: 'Nét đứt', Dotted: 'Chấm', 'Logged-in Account Menu': 'Menu tài khoản đã đăng nhập', English: 'Tiếng Anh',
  BLOG: 'Bài viết', CONFIRM_EMAIL: 'Xác nhận email', FORGOT_PASSWORD: 'Quên mật khẩu',
  FRONT_PAGE: 'Trang chủ', PASSWORD_CHANGE: 'Đổi mật khẩu', PROFILE: 'Hồ sơ', 
  SIGN_IN: 'Đăng nhập', SIGN_UP: 'Đăng ký', TERM_CONDITION: 'Điều khoản', 
  
  'Blog Feed': 'Danh sách bài viết', 'Blog Feeds': 'Danh sách bài viết', Column: 'Cột', Contents: 'Nội dung',
  Cta: 'Lời kêu gọi hành động', Ctas: 'Lời kêu gọi hành động', Divider: 'Đường phân cách', Dividers: 'Đường phân cách',
  Embed: 'Nội dung nhúng', Embeds: 'Nội dung nhúng', Founder: 'Người sáng lập', Heroes: 'Ảnh đầu trang',
  'Icon header': 'Biểu tượng đầu mục', 'Image Gallery': 'Thư viện ảnh', 'Image Galleries': 'Thư viện ảnh',
  'Offer Card': 'Thẻ ưu đãi', 'Offer Cards': 'Thẻ ưu đãi', 
  'Pricing Table': 'Bảng giá', 'Pricing Tables': 'Bảng giá', 
  'Search Embeds': 'Khối tìm kiếm nhúng', Slide: 'Trang trình chiếu', Sliders: 'Băng chuyền ảnh',
  Stat: 'Số liệu', Stats: 'Số liệu', Testimonial: 'Đánh giá khách hàng', Testimonials: 'Đánh giá khách hàng',
}

const DESCRIPTIONS_VI: Record<string, string> = {
  'R2 access key ID (per-bucket token).': 'Mã khóa truy cập R2 (token riêng cho từng kho lưu trữ).',
  'R2 secret access key (per-bucket token).': 'Khóa truy cập bí mật R2 (token riêng cho từng kho lưu trữ).',
  'Icon badge 1.': 'Biểu tượng thông báo 1.', 'Icon badge 2.': 'Biểu tượng thông báo 2.',
  'Auto-derived from description length. Flags <500 as thin.': 'Tự tính theo độ dài mô tả. Nội dung dưới 500 từ được đánh dấu là ngắn.',
  'URL-friendly identifier. Must be unique within a tenant + type combination.': 'Đường dẫn không dấu, duy nhất trong cùng website và loại phân loại.',
  'Parent taxonomy for hierarchical types (category). Leave empty for root.': 'Phân loại cha của chuyên mục. Để trống nếu là mục gốc.',
  
  
  
  'Focus keywords for SEO (comma-separated or multiple values).': 'Từ khóa SEO trọng tâm (phân cách bằng dấu phẩy hoặc nhập nhiều giá trị).',
  'URL-friendly author identifier. Must be unique within a tenant (author @id / profile URL).': 'Đường dẫn tác giả không dấu, duy nhất trong website (dùng cho @id và URL hồ sơ).',
  'Author profile picture.': 'Ảnh đại diện của tác giả.',
  'Question/answer pairs in this FAQ group.': 'Các cặp câu hỏi và trả lời trong nhóm này.',
  'URL-friendly identifier. Auto-generated from title if left blank.': 'Đường dẫn không dấu. Tự tạo từ tiêu đề nếu để trống.',
  'Marks this page as a topic-cluster pillar. Renders hero banner above DefaultPage layout when true.': 'Đánh dấu trang trụ cột của cụm chủ đề. Khi bật, hiển thị banner nổi bật phía trên bố cục trang mặc định.',
  'FAQ groups to attach for FAQPage JSON-LD (generate-jsonld.ts). Body FAQ visible to users; this relationship only feeds the JSON-LD hook.': 'Nhóm câu hỏi dùng cho JSON-LD FAQPage. Liên kết này chỉ cung cấp dữ liệu schema; nội dung câu hỏi hiển thị nằm trong thân bài.',
  'Cluster taxonomy (type=category). Powers internal linking matrix (Phase 5).': 'Chuyên mục của cụm nội dung, dùng để gợi ý liên kết nội bộ.',
  'Auto-maintained count of approved comments. Not editable directly.': 'Số bình luận đã duyệt được cập nhật tự động, không sửa trực tiếp.',
  
  'Slide images for the hero carousel.': 'Ảnh trình chiếu trong khu vực nổi bật.',
  'FAQ groups to display on this landing page.': 'Nhóm câu hỏi hiển thị trên trang đích.',
  
  
  'Hide this landing page from public.': 'Ẩn trang đích khỏi website công khai.',
  'Raw HTML/iframe embed code.': 'Mã nhúng HTML hoặc iframe.',
  
  'Campaign tracking fields.': 'Thông tin theo dõi chiến dịch.',
  'Inline FAQ items for JSON-LD FAQPage schema.': 'Câu hỏi và trả lời dùng cho schema JSON-LD FAQPage.',
  
  
  
  
  
  
  
  
  
  
  'Linked taxonomies: categories, tags, product categories.': 'Phân loại liên kết: chuyên mục, thẻ, danh mục sản phẩm.',
  Currency: 'Tiền tệ', 'Custom Type': 'Loại tùy chỉnh',
  'String ID of the rated document.': 'Mã dạng chuỗi của tài liệu được đánh giá.',
}

export function adminDisplayLabel<T>(label: T, name?: string): T | { vi: string; en: string } {
  const candidate = label ?? (name ? toWords(name) : undefined)
  if (typeof candidate === 'string' && VI[candidate]) return { vi: VI[candidate], en: candidate }
  if (candidate && typeof candidate === 'object' && 'vi' in candidate && typeof candidate.vi === 'string' && VI[candidate.vi]) {
    return { ...candidate, vi: VI[candidate.vi] } as T
  }
  return label
}

export function adminDisplayDescription<T>(description: T): T | { vi: string; en: string } {
  if (typeof description === 'string' && DESCRIPTIONS_VI[description]) return { vi: DESCRIPTIONS_VI[description], en: description }
  return description
}
