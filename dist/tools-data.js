// Single source of truth for the tool catalogue. The home page renders every card, menu entry,
// filter count and search result from this list, so adding a tool means adding one entry here
// and nothing else. Routes match the directories under /tools.

export const CATEGORIES = [
  { id: 'video', label: 'Video', blurb: 'Tools for editing and processing videos' },
  { id: 'image', label: 'Image', blurb: 'Tools for editing and optimizing images' },
  { id: 'document', label: 'Converters', blurb: 'Tools for converting documents' },
  { id: 'pdf', label: 'PDF', blurb: 'Tools for merging, splitting and converting PDF files' },
];

// Icons are inline SVG bodies (24x24, currentColor strokes) so the page ships no icon library.
const icon = {
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4V8Z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  resize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3 14 10"/><path d="M3 21l7-7"/>',
  compress: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="m9 15-5 5"/><path d="m15 9 5-5"/><path d="M15 9h5V4"/><path d="M9 15H4v5"/>',
  convert: '<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M12 8v8"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  imagePdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="10" cy="12" r="1.5"/><path d="m20 17-3.5-3.5L8 22"/>',
  sheetPdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 12h8M8 16h8M12 12v6"/>',
  mergePdf: '<rect x="3" y="3" width="11" height="14" rx="1.5"/><rect x="10" y="7" width="11" height="14" rx="1.5"/><path d="M13 14h5M15.5 11.5v5"/>',
  splitPdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M4 13h16" stroke-dasharray="2 2"/>',
  pdfImage: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/><path d="M14 3v4h4"/>',
  rotatePdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M15 15a3.5 3.5 0 1 1-1-2.5"/><path d="M15 11.5v1.5h-1.5"/>',
  lockPdf: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1a1 1 0 1 0 0-2H9v4"/><path d="M13 17v-4h1.5"/><path d="M13 15h1"/><path d="M17 13v4h1"/>',
};

export const TOOLS = [
  {
    id: 'remove-watermark-video',
    name: 'Remove Watermark from Video',
    short: 'Video Watermark',
    description: 'Erase watermarks and logos from any clip.',
    href: '/tools/remove-watermark-video',
    category: 'video',
    icon: icon.video,
    keywords: ['watermark', 'logo', 'video', 'remove', 'erase', 'delogo'],
  },
  {
    id: 'remove-watermark-image',
    name: 'Remove Watermark',
    short: 'Remove Watermark',
    description: 'Paint out watermarks and unwanted objects.',
    href: '/tools/remove-watermark-image',
    category: 'image',
    icon: icon.sparkle,
    keywords: ['watermark', 'remove', 'inpaint', 'clean', 'object'],
    popular: true,
  },
  {
    id: 'crop-image',
    name: 'Crop Image',
    short: 'Crop',
    description: 'Trim to any size or aspect ratio.',
    href: '/tools/crop-image',
    category: 'image',
    icon: icon.crop,
    keywords: ['crop', 'trim', 'aspect', 'ratio', 'cut'],
    popular: true,
  },
  {
    id: 'resize-image',
    name: 'Resize Image',
    short: 'Resize',
    description: 'Set exact dimensions or scale by percentage.',
    href: '/tools/resize-image',
    category: 'image',
    icon: icon.resize,
    keywords: ['resize', 'scale', 'dimensions', 'pixels', 'shrink', 'enlarge'],
    popular: true,
  },
  {
    id: 'compress-image',
    name: 'Compress Image',
    short: 'Compress',
    description: 'Shrink files with a live quality preview.',
    href: '/tools/compress-image',
    category: 'image',
    icon: icon.compress,
    keywords: ['compress', 'optimize', 'smaller', 'quality', 'size', 'shrink'],
    popular: true,
  },
  {
    id: 'convert-image',
    name: 'Convert Image',
    short: 'Convert',
    description: 'Switch between JPG, PNG and WebP.',
    href: '/tools/convert-image',
    category: 'image',
    icon: icon.convert,
    keywords: ['convert', 'jpg', 'jpeg', 'png', 'webp', 'format', 'change'],
  },
  {
    id: 'rotate-image',
    name: 'Rotate & Flip Image',
    short: 'Rotate',
    description: 'Turn a sideways photo upright, or mirror it.',
    href: '/tools/rotate-image',
    category: 'image',
    icon: icon.rotate,
    keywords: ['rotate', 'flip', 'mirror', 'turn', 'sideways', 'upright', 'orientation', '90'],
  },
  {
    id: 'image-to-text',
    name: 'Image to Text (OCR)',
    short: 'Image to Text',
    description: 'Extract text from images, screenshots and scanned documents.',
    href: '/tools/image-to-text',
    category: 'image',
    icon: icon.text,
    keywords: ['ocr', 'text', 'extract', 'scan', 'screenshot', 'copy', 'recognize', 'image to text'],
    popular: true,
  },
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    short: 'Word to PDF',
    description: 'Convert a .docx file to a downloadable PDF.',
    href: '/tools/word-to-pdf',
    category: 'document',
    icon: icon.pdf,
    keywords: ['word', 'docx', 'pdf', 'convert', 'document'],
    popular: true,
  },
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    short: 'JPG to PDF',
    description: 'Combine JPG photos into one PDF, in any order.',
    href: '/tools/jpg-to-pdf',
    category: 'document',
    icon: icon.imagePdf,
    keywords: ['jpg', 'jpeg', 'photo', 'image', 'pdf', 'convert', 'combine', 'jpg to pdf', 'image to pdf'],
    popular: true,
  },
  {
    id: 'png-to-pdf',
    name: 'PNG to PDF',
    short: 'PNG to PDF',
    description: 'Turn PNG images into a PDF without losing quality.',
    href: '/tools/png-to-pdf',
    category: 'document',
    icon: icon.imagePdf,
    keywords: ['png', 'image', 'screenshot', 'pdf', 'convert', 'combine', 'png to pdf', 'image to pdf'],
  },
  {
    id: 'excel-to-pdf',
    name: 'Excel to PDF',
    short: 'Excel to PDF',
    description: 'Convert an .xlsx spreadsheet to PDF, keeping its formatting.',
    href: '/tools/excel-to-pdf',
    category: 'document',
    icon: icon.sheetPdf,
    keywords: ['excel', 'xlsx', 'spreadsheet', 'sheet', 'workbook', 'pdf', 'convert', 'excel to pdf'],
    popular: true,
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    short: 'Merge PDF',
    description: 'Combine several PDF files into one, in any order.',
    href: '/tools/merge-pdf',
    category: 'pdf',
    icon: icon.mergePdf,
    keywords: ['merge', 'combine', 'join', 'pdf', 'merge pdf', 'combine pdf', 'join pdf'],
    popular: true,
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    short: 'Split PDF',
    description: 'Separate a PDF into parts or extract the pages you need.',
    href: '/tools/split-pdf',
    category: 'pdf',
    icon: icon.splitPdf,
    keywords: ['split', 'separate', 'extract', 'pages', 'pdf', 'split pdf', 'extract pages', 'divide'],
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    short: 'PDF to JPG',
    description: 'Turn PDF pages into high-quality JPG images.',
    href: '/tools/pdf-to-jpg',
    category: 'pdf',
    icon: icon.pdfImage,
    keywords: ['pdf to jpg', 'pdf to jpeg', 'pdf to image', 'convert pdf', 'pdf', 'jpg', 'jpeg', 'image', 'pages'],
    popular: true,
  },
  {
    id: 'pdf-to-png',
    name: 'PDF to PNG',
    short: 'PDF to PNG',
    description: 'Turn PDF pages into crisp, lossless PNG images.',
    href: '/tools/pdf-to-png',
    category: 'pdf',
    icon: icon.pdfImage,
    keywords: ['pdf to png', 'pdf to image', 'convert pdf', 'pdf', 'png', 'image', 'pages'],
  },
  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    short: 'Rotate PDF',
    description: 'Turn sideways or upside-down PDF pages the right way.',
    href: '/tools/rotate-pdf',
    category: 'pdf',
    icon: icon.rotatePdf,
    keywords: ['rotate', 'turn', 'sideways', 'upside down', 'orientation', 'pdf', 'rotate pdf', 'landscape', 'portrait'],
  },
  {
    id: 'protect-pdf',
    name: 'Protect PDF',
    short: 'Protect PDF',
    description: 'Add a password to a PDF with AES-256 encryption.',
    href: '/tools/protect-pdf',
    category: 'pdf',
    icon: icon.lockPdf,
    keywords: ['protect', 'password', 'encrypt', 'lock', 'secure', 'pdf', 'protect pdf', 'password protect pdf', 'encrypt pdf'],
  },
];

export const toolsIn = (category) => TOOLS.filter((tool) => tool.category === category);

export const popularTools = () => TOOLS.filter((tool) => tool.popular);

// Matches on name, description and keywords so "jpg" finds the converter and "smaller" finds
// the compressor — people search by what they want, not by the tool's name.
export function searchTools(query, category = 'all') {
  const term = query.trim().toLowerCase();
  return TOOLS.filter((tool) => {
    if (category !== 'all' && tool.category !== category) return false;
    if (!term) return true;
    return (
      tool.name.toLowerCase().includes(term) ||
      tool.description.toLowerCase().includes(term) ||
      tool.keywords.some((keyword) => keyword.includes(term))
    );
  });
}
