// Single source of truth for the tool catalogue. The home page renders every card, menu entry,
// filter count and search result from this list, so adding a tool means adding one entry here
// and nothing else. Routes match the directories under /tools.

export const CATEGORIES = [
  { id: 'video', label: 'Video', blurb: 'Tools for editing and processing videos' },
  { id: 'image', label: 'Image', blurb: 'Tools for editing and optimizing images' },
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
};

export const TOOLS = [
  {
    id: 'remove-watermark-video',
    name: 'Remove Logo from Video',
    short: 'Remove Logo',
    description: 'Erase logos and watermarks from any clip.',
    href: '/tools/remove-watermark-video',
    category: 'video',
    icon: icon.video,
    keywords: ['logo', 'watermark', 'video', 'erase', 'delogo'],
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
