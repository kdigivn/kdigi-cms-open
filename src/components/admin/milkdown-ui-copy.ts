'use client'

import { useTranslation } from '@payloadcms/ui'

// UI vocabulary only. Never pass document text, saved values or command IDs here.
const VI: Record<string, string> = {
  Image: 'Hình ảnh', Find: 'Tìm kiếm', Shortcuts: 'Phím tắt',
  'Focus mode': 'Chế độ tập trung', 'Exit focus': 'Thoát tập trung', Exit: 'Thoát',
  'Write without the Payload form chrome. Press Esc to exit.': 'Tập trung viết nội dung. Nhấn Esc để thoát.',
  'Table of contents': 'Mục lục', 'Document outline': 'Mục lục tài liệu', 'No headings yet': 'Chưa có tiêu đề',
  headings: 'tiêu đề', words: 'từ', characters: 'ký tự', 'Jump to': 'Chuyển đến',
  'Find and replace': 'Tìm và thay thế', 'Find in editor': 'Tìm trong nội dung',
  'Previous match': 'Kết quả trước', 'Next match': 'Kết quả tiếp theo',
  'Toggle case sensitive search': 'Phân biệt chữ hoa và chữ thường',
  'Close find and replace': 'Đóng tìm và thay thế', 'Replace with': 'Thay bằng',
  Replace: 'Thay thế', 'Replace all': 'Thay tất cả',
  'Keyboard shortcuts': 'Phím tắt', 'Close shortcuts': 'Đóng phím tắt', Keyboard: 'Bàn phím',
  'Lark-style writing shortcuts for Content Md.': 'Phím tắt soạn thảo nội dung Markdown.',
  'Available while the editor is focused.': 'Sử dụng khi đang đặt con trỏ trong trình soạn thảo.',
  'Heading 1-6': 'Tiêu đề cấp 1–6', 'Body text': 'Đoạn văn', Text: 'Đoạn văn',
  'Heading 1': 'Tiêu đề cấp 1', 'Heading 2': 'Tiêu đề cấp 2', 'Heading 3': 'Tiêu đề cấp 3',
  'Heading 4': 'Tiêu đề cấp 4', 'Heading 5': 'Tiêu đề cấp 5', 'Heading 6': 'Tiêu đề cấp 6',
  'Bulleted list': 'Danh sách dấu đầu dòng', 'Bulleted List': 'Danh sách dấu đầu dòng',
  'Numbered list': 'Danh sách đánh số', 'Numbered List': 'Danh sách đánh số',
  'To-do list': 'Danh sách công việc', 'To-do List': 'Danh sách công việc', 'Checked to-do': 'Công việc hoàn thành',
  Quote: 'Trích dẫn', 'Code block': 'Khối mã', 'Code Block': 'Khối mã', Divider: 'Đường phân cách',
  'Insert or edit link': 'Chèn hoặc sửa liên kết', 'Open this help panel': 'Mở bảng trợ giúp',
  'Inline code': 'Mã nội dòng', 'Inline Code': 'Mã nội dòng', Bold: 'In đậm', Italic: 'In nghiêng', Strikethrough: 'Gạch ngang',
  Table: 'Bảng', Link: 'Liên kết', 'Text formatting': 'Định dạng văn bản', 'Turn into': 'Chuyển thành', currently: 'hiện tại',
  'Insert block': 'Chèn khối', 'No results': 'Không có kết quả', 'Insert block below': 'Chèn khối bên dưới',
  'Block menu': 'Menu khối', Block: 'Khối', Duplicate: 'Nhân bản', Delete: 'Xoá',
  'Move up': 'Di chuyển lên', 'Move down': 'Di chuyển xuống',
  'Cơ bản/Basics': 'Cơ bản', 'Chèn/Common': 'Chèn', 'Đoạn mẫu/Snippets': 'Đoạn mẫu',
  'Insert image': 'Chèn hình ảnh', 'Close image modal': 'Đóng hộp thoại hình ảnh',
  'Upload a new image, reuse media library assets, or paste a URL.': 'Tải ảnh mới, chọn từ thư viện hoặc dán đường dẫn URL.',
  Upload: 'Tải lên', Library: 'Thư viện', 'Uploading…': 'Đang tải lên…', 'Choose an image': 'Chọn hình ảnh',
  'Creates a new media doc, then lets you confirm alt text before inserting.': 'Tạo ảnh mới trong thư viện, sau đó xác nhận mô tả ảnh trước khi chèn.',
  'Search filename or alt text': 'Tìm tên tệp hoặc mô tả ảnh', Root: 'Thư mục gốc', Retry: 'Thử lại',
  'Loading media…': 'Đang tải thư viện…', 'No image found.': 'Không tìm thấy hình ảnh.',
  Previous: 'Trước', Next: 'Tiếp', Page: 'Trang', 'up to': 'tối đa', 'per page': 'mỗi trang',
  'Image URL': 'URL hình ảnh', 'Alt text': 'Mô tả ảnh', 'Describe the image': 'Mô tả nội dung hình ảnh',
  'Fetching…': 'Đang tải…', 'Fetch and add image': 'Tải và thêm hình ảnh',
  'Alt text for selected image': 'Mô tả hình ảnh đã chọn', Insert: 'Chèn', Cancel: 'Huỷ',
  'The library follows the document website, which differs from the selected admin website.': 'Thư viện thuộc website của tài liệu, khác với website đang chọn trong trang quản trị.',
}
const EN: Record<string, string> = { 'Cơ bản/Basics': 'Basics', 'Chèn/Common': 'Insert', 'Đoạn mẫu/Snippets': 'Snippets' }
const vietnamese = (label: string) => VI[label] ?? label
const english = (label: string) => EN[label] ?? label

export function useEditorCopy() {
  const { i18n } = useTranslation()
  return i18n.language === 'en' ? english : vietnamese
}
