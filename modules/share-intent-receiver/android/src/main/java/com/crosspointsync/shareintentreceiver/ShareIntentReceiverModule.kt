package com.crosspointsync.shareintentreceiver

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareIntentReceiverModule : Module() {

  private var cachedItems: List<Map<String, Any?>>? = null

  override fun definition() = ModuleDefinition {
    Name("ShareIntentReceiver")

    Events("onShareIntent")

    Function("getSharedItems") {
      // Return cache if already extracted (e.g. from OnNewIntent), else extract now
      cachedItems ?: run {
        val activity = appContext.currentActivity
        if (activity != null) {
          val items = extractItemsFromIntent(activity.intent)
          cachedItems = items
          items
        } else {
          emptyList<Map<String, Any?>>()
        }
      }
    }

    Function("clearIntent") {
      cachedItems = null
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.intent = Intent()
      }
      null
    }

    OnActivityResult { _, _ ->
      val activity = appContext.currentActivity
      val intent = activity?.intent
      if (intent != null && (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE)) {
        cachedItems = null
        val items = extractItemsFromIntent(intent)
        cachedItems = items
        if (items.isNotEmpty()) {
          sendEvent("onShareIntent", mapOf("items" to items))
        }
      }
    }

    OnNewIntent { intent ->
      cachedItems = null
      val items = extractItemsFromIntent(intent)
      cachedItems = items
      if (items.isNotEmpty()) {
        appContext.currentActivity?.intent = intent
        sendEvent("onShareIntent", mapOf("items" to items))
      }
    }
  }

  private fun extractItemsFromIntent(intent: Intent): List<Map<String, Any?>> {
    val items = mutableListOf<Map<String, Any?>>()

    when (intent.action) {
      Intent.ACTION_SEND -> {
        val type = intent.type ?: ""
        if (type == "text/plain") {
          val text = intent.getStringExtra(Intent.EXTRA_TEXT)
          if (text != null) {
            items.add(mapOf("type" to "text", "text" to text))
          }
        } else {
          @Suppress("DEPRECATION")
          val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
          if (uri != null) {
            val fileInfo = resolveUri(uri, type)
            if (fileInfo != null) {
              items.add(fileInfo)
            }
          }
        }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        @Suppress("DEPRECATION")
        val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        val type = intent.type ?: ""
        uris?.forEach { uri ->
          val fileInfo = resolveUri(uri, type)
          if (fileInfo != null) {
            items.add(fileInfo)
          }
        }
      }
    }

    return items
  }

  private fun resolveUri(uri: Uri, mimeType: String): Map<String, Any?>? {
    val context = appContext.reactContext ?: return null
    val resolver = context.contentResolver

    var name: String? = null
    var size: Long? = null

    try {
      resolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (nameIdx >= 0) name = cursor.getString(nameIdx)
          val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (sizeIdx >= 0) size = cursor.getLong(sizeIdx)
        }
      }
    } catch (_: Exception) {
      // Some providers may not support querying
    }

    if (name == null) {
      name = uri.lastPathSegment ?: "unknown"
    }

    // Copy content:// to file:// in app cache so expo-file-system can read it
    val cacheDir = java.io.File(context.cacheDir, "shared-imports")
    if (!cacheDir.exists()) cacheDir.mkdirs()
    val destFile = java.io.File(cacheDir, "${System.currentTimeMillis()}-${name}")

    try {
      resolver.openInputStream(uri)?.use { input ->
        destFile.outputStream().use { output -> input.copyTo(output) }
      } ?: return null
    } catch (e: Exception) {
      destFile.delete()
      return null
    }

    return mapOf(
      "type" to "file",
      "uri" to Uri.fromFile(destFile).toString(),
      "name" to name,
      "size" to (if (size != null && size!! > 0) size else destFile.length()),
      "mimeType" to (resolver.getType(uri) ?: mimeType)
    )
  }
}
