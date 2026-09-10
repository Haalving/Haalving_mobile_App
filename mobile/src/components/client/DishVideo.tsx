import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Icon } from '@/components/ui/Icon';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * "HOW IT'S MADE" — the dish's film, in the demo's 16:9 box (app.css .tvid).
 *
 * The catalogue holds one link per item (`media.video`, the Video field on the
 * Catalog item sheet). A direct file plays in an HTML5 player; a YouTube link
 * plays through YouTube's own embed; anything else is framed as it is. With no
 * link yet the box stays, with a play mark and a line saying the film is
 * coming — the place is kept, and nothing is invented to fill it.
 */

const FILE = /\.(mp4|webm|ogg|m3u8)(\?|#|$)/i;

/** The eleven-character id from any of the YouTube URL shapes, or null. */
function youtubeId(url: string): string | null {
  const m =
    url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/) ?? null;
  return m?.[1] ?? null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The page inside the box — one element filling it, on black. */
function pageFor(url: string, title: string): string | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  const inner = FILE.test(u)
    ? `<video src="${esc(u)}" controls playsinline preload="metadata" title="${esc(title)}"></video>`
    : youtubeId(u)
      ? `<iframe src="https://www.youtube.com/embed/${youtubeId(u)}?rel=0&modestbranding=1&playsinline=1" title="${esc(title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : `<iframe src="${esc(u)}" title="${esc(title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
video,iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;object-fit:cover;background:#000}</style>
</head><body>${inner}</body></html>`;
}

export function DishVideo({ url, title }: { url: string | null | undefined; title: string }) {
  const c = useTheme();
  const html = useMemo(() => (url ? pageFor(url, title) : null), [url, title]);

  if (!html) {
    return (
      <View style={[styles.box, styles.empty, { backgroundColor: c.surface3 }]}>
        <View style={[styles.play, { borderColor: c.ink3 }]}>
          <Icon name="video" size={22} color={c.ink3} strokeWidth={1.5} />
        </View>
        <Text style={[styles.emptyText, { color: c.ink3 }]}>
          The film for this dish plays here once your dietitian links it.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, { backgroundColor: '#000' }]}>
      <WebView
        source={{ html, baseUrl: 'https://haalving.app' }}
        style={styles.web}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /* .tvid — 16:9, radius md, clipped */
  box: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.s3 },
  web: { flex: 1, backgroundColor: '#000' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.s2, paddingHorizontal: spacing.s5 },
  play: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: t.xs, textAlign: 'center', lineHeight: t.xs * 1.5 },
});
