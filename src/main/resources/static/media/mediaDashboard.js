// File: mediaDashboard.js
import { firstRender, renderFolder, stageAutoplayFor, renderGroupLabel, playAndStage } from '/explorer/explorer.js';
import { setLastClickedGroupLabel } from '/explorer/path.js';

function getViewerMediaTitleEl() {
  return document.getElementById('media-title');
}

function titleFromPath(p) {
  const segs = String(p || "").split("/").filter(Boolean);
  if (segs.length < 2) return "";

  // if last segment is "index.m3u8", use parent folder
  const leaf = segs[segs.length - 1];
  if (/^index\./i.test(leaf)) {
    return segs[segs.length - 2];
  }

  // otherwise return last segment
  return segs[segs.length - 1];
}

// User dashboard to jump to media
export async function handleJumpParam() {
  const params = new URLSearchParams(window.location.search);
  const jumpTo = params.get("jumpTo");
  if (!jumpTo) return;

  const parts = jumpTo.split("/").filter(Boolean);
  if (parts.length < 2) return;
  
  // "TV" | "Movies" | "Music"
  const root = parts[0];      
  // stop before "index.m3u8"
  const endIdx = parts.length - 1;      
  // render root first
  await firstRender(root);              

  // walk directory tree
  let acc = root;                       
  for (let i = 1; i < endIdx; i++) {
    acc = `${acc}/${parts[i]}`.replace(/\/{2,}/g, "/");
    await renderFolder(acc);           
  }

  const parentOfEpisode = (endIdx - 1) >= 0 ? parts[endIdx - 1] : "";
  setLastClickedGroupLabel(parentOfEpisode);
  renderGroupLabel();
  
  // done walking; trigger autoplay + playback
  await playAndStage(jumpTo);  
}