import { log } from '@/services/logger';
import { extractArticleViaWebView } from '@/services/webview-article-extractor';
import { extractArticleFromUrl, downloadImagesFromUrls } from '@/services/url-article-extractor';

export interface ExtractedArticleWithImages {
  title: string;
  author: string;
  sourceUrl: string;
  html: string;
  images: Array<{ originalUrl: string; localPath: string; mimeType: string; data: Uint8Array }>;
}

export async function extractViaWebViewWithFallback(url: string): Promise<ExtractedArticleWithImages> {
  // Try WebView extraction first for better quality on JS-rendered pages
  try {
    log('clip', `Trying WebView extraction for ${url}`);
    const webViewResult = await extractArticleViaWebView(url);

    // Download images from the pre-extracted URLs
    const images = await downloadImagesFromUrls(webViewResult.images);
    log('clip', `WebView extraction complete: "${webViewResult.title}" (${images.length} images)`);

    return {
      title: webViewResult.title,
      author: webViewResult.author,
      sourceUrl: webViewResult.sourceUrl,
      html: webViewResult.html,
      images,
    };
  } catch (e) {
    log('clip', `WebView extraction failed, falling back to fetch+regex: ${e}`);
    return extractArticleFromUrl(url);
  }
}
