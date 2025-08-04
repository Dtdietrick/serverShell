// FILE: player.js
import Plyr from 'https://cdn.jsdelivr.net/npm/plyr@3.7.8/+esm';

let plyrInstance = null;

export function loadMedia(targetElement, src, type, isVideo = true) {
  const baseAttrs = `controls crossorigin playsinline controlsList="nodownload" oncontextmenu="return false"`;
  const mediaTag = isVideo ? "video" : "audio";

  targetElement.innerHTML = `
    <${mediaTag} id="plyr-media" ${baseAttrs}>
      <source src="${src}" type="${type}">
      ${isVideo ? "Video" : "Audio"} not supported.
    </${mediaTag}>
  `;

  const mediaElement = targetElement.querySelector("#plyr-media");
  if (!mediaElement) return null;

  // Rebuild Plyr instance
  if (plyrInstance) plyrInstance.destroy();
  plyrInstance = new Plyr(mediaElement, {
    controls: [
      'play', 'progress', 'current-time', 'mute', 'volume',
      'captions', 'settings', 'fullscreen'
    ],
    settings: ['captions', 'quality', 'speed', 'loop'],
  });

  return mediaElement;
}